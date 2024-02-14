// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ==========================================================
// ====================== TraderJoeAMM.sol ==================
// ==========================================================

/**
 * @title TradeJoe AMM
 * @dev Interactions with TradeJoe Pool
 */

import {ChainlinkLibrary, IPriceFeed} from "../Libraries/Chainlink.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ISweep} from "../Sweep/ISweep.sol";

import {IMarketMaker} from "../MarketMaker/IMarketMaker.sol";
import {ILBRouter, ILBPair, IERC20} from "../Assets/Interfaces/TraderJoe/ITraderJoe.sol";
import {JoeQuoter} from "../Libraries/TraderJoe/JoeQuoter.sol";

contract TraderJoeAMM {
    using Math for uint256;

    ILBPair public pool;
    JoeQuoter private immutable quoter;
    ILBRouter public immutable router;
    IMarketMaker public marketMaker;

    IERC20Metadata public immutable base;
    ISweep public immutable sweep;
    IPriceFeed public immutable oracleBase;
    IPriceFeed public immutable sequencer;
    uint256 public immutable frequency;
    bool private immutable flag;

    uint24 private constant PRECISION = 1e6;

    constructor(
        address _sweep,
        address _base,
        address _sequencer,
        address _oracleBase,
        uint256 _frequency,
        address _router,
        address _pool,
        address quoterLibray
    ) {
        sweep = ISweep(_sweep);
        base = IERC20Metadata(_base);
        oracleBase = IPriceFeed(_oracleBase);
        sequencer = IPriceFeed(_sequencer);
        frequency = _frequency;

        router = ILBRouter(_router);
        pool = ILBPair(_pool);
        quoter = JoeQuoter(quoterLibray);
        flag = pool.getTokenX() == address(_base);
    }

    // Events
    event Bought(uint256 usdxAmount);
    event Sold(uint256 sweepAmount);

    // Errors
    error ZeroAmount();
    error BadRate();
    error NotOwnerOrGov();
    error SlippageCheck();

    modifier onlyOwner() {
        if (msg.sender != sweep.fastMultisig() && msg.sender != sweep.owner())
            revert NotOwnerOrGov();
        _;
    }

    /**
     * @notice Get Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getPrice() public view returns (uint256 amountOut) {
        uint24 activeId = pool.getActiveId();
        uint256 poolPrice = pool.getPriceFromId(activeId);
        uint128 quote = quoter._getV2Quote(poolPrice, !flag);

        uint256 price = ChainlinkLibrary.getPrice(oracleBase, sequencer, frequency);
        uint8 priceDecimals = ChainlinkLibrary.getDecimals(oracleBase);

        amountOut = uint256(quote).mulDiv(price, 10 ** (priceDecimals));
    }

    /**
     * @notice Get TWA Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getTWAPrice() external view returns (uint256) {
        return getPrice();
    }

    function getPositions(uint256) public view
        returns (uint256 usdxAmount, uint256 sweepAmount, uint256 lp)
    {
        if (address(pool) != address(0)) {
            usdxAmount = base.balanceOf(address(pool));
            sweepAmount = sweep.balanceOf(address(pool));
            lp = 0;
        }
    }

    /* ========== Actions ========== */

    /**
     * @notice Buy Sweep
     * @param usdxAddress Token Address to use for buying sweep.
     * @param usdxAmount Token Amount.
     * @param amountOutMin Minimum amount out.
     * @dev Increases the sweep balance and decrease collateral balance.
     */
    function buySweep(
        address usdxAddress,
        uint256 usdxAmount,
        uint256 amountOutMin
    ) external returns (uint256 sweepAmount) {
        emit Bought(usdxAmount);

        if (address(marketMaker) != address(0) && marketMaker.getBuyPrice() < getPrice()) {
            TransferHelper.safeTransferFrom(address(base), msg.sender, address(this), usdxAmount);
            TransferHelper.safeApprove(address(base), address(marketMaker), usdxAmount);
            sweepAmount = marketMaker.buySweep(usdxAmount);
            TransferHelper.safeTransfer(address(sweep), msg.sender, sweepAmount);
        } else {
            checkRate(usdxAddress, usdxAmount, amountOutMin);
            sweepAmount = swap(usdxAddress, address(sweep), usdxAmount, amountOutMin);
        }
    }

    /**
     * @notice Sell Sweep
     * @param usdxAddress Token Address to return after selling sweep.
     * @param sweepAmount Sweep Amount.
     * @param amountOutMin Minimum amount out.
     * @dev Decreases the sweep balance and increase collateral balance
     */
    function sellSweep(
        address usdxAddress,
        uint256 sweepAmount,
        uint256 amountOutMin
    ) external returns (uint256 tokenAmount) {
        emit Sold(sweepAmount);
        checkRate(usdxAddress, amountOutMin, sweepAmount);
        tokenAmount = swap(address(sweep), usdxAddress, sweepAmount, amountOutMin);
    }

    /**
     * @notice Swap tokenIn for tokenOut using balancer exact input swap
     * @param tokenIn Address to in
     * @param tokenOut Address to out
     * @param amountIn Amount of _tokenA
     * @param amountOutMin Minimum amount out.
     */
    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint24,
        uint256 amountIn,
        uint256 amountOutMin
    ) public returns (uint256 amountOut) {
        return swap(tokenIn, tokenOut, amountIn, amountOutMin);
    }

    function checkRate(
        address token,
        uint256 tokenAmount,
        uint256 sweepAmount
    ) internal view {
        if (tokenAmount == 0 || sweepAmount == 0) revert ZeroAmount();
        uint256 tokenFactor = 10 ** IERC20Metadata(token).decimals();
        uint256 sweepFactor = 10 ** sweep.decimals();
        uint256 rate = (tokenAmount * sweepFactor * 1e6) /
            (tokenFactor * sweepAmount);
        if (rate > 16e5 || rate < 6e5) revert BadRate();
    }

    /**
     * @notice Swap tokenIn for tokenOut using balancer exact input swap
     * @param tokenIn Address to in
     * @param tokenOut Address to out
     * @param amountIn Amount of _tokenA
     * @param amountOutMin Minimum amount out.
     */
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin
    ) private returns (uint256 amountOut) {
        TransferHelper.safeTransferFrom(tokenIn, msg.sender, address(this), amountIn);
        TransferHelper.safeApprove(tokenIn, address(router), amountIn);

        IERC20[] memory tokenPath = new IERC20[](2);
        tokenPath[0] = IERC20(tokenIn);
        tokenPath[1] = IERC20(tokenOut);

        uint256[] memory pairBinSteps = new uint256[](1);
        pairBinSteps[0] = pool.getBinStep();

        ILBRouter.Version[] memory versions = new ILBRouter.Version[](1);
        versions[0] = ILBRouter.Version.V2_1;

        ILBRouter.Path memory path;
        path.pairBinSteps = pairBinSteps;
        path.versions = versions;
        path.tokenPath = tokenPath;

        (, amountOut, ) = pool.getSwapOut(uint128(amountIn), pool.getTokenY() == tokenOut);
        if (amountOut < amountOutMin) revert SlippageCheck();

        amountOut = router.swapExactTokensForTokens(
            amountIn,
            0,
            path,
            msg.sender,
            block.timestamp + 1
        );
    }

    function setPool(address poolAddress) external {
        require(msg.sender == sweep.owner(), "TraderJoeAMM: Not Governance");
        pool = ILBPair(poolAddress);
    }

    function setMarketMaker(address _marketMaker) external onlyOwner {
        marketMaker = IMarketMaker(_marketMaker);
    }
}

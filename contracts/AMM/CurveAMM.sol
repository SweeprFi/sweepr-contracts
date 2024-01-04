// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ==========================================================
// ====================== CurveAMM.sol ====================
// ==========================================================

/**
 * @title Curve AMM
 * @dev Interactions with Curve Pool
 */

import { ChainlinkLibrary, IPriceFeed } from "../Libraries/Chainlink.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import { TransferHelper } from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import { ISweep } from "../Sweep/ISweep.sol";
import { ICurvePool } from "../Assets/Interfaces/Curve/ICurve.sol";
import { IMarketMaker } from "../Balancer/IMarketMaker.sol";

contract CurveAMM {

    ICurvePool public pool;
    IMarketMaker public marketMaker;
    mapping(address => uint8) public assetIndex;

    uint8 public constant USDX_IDX = 0;
    uint8 public constant SWEEP_IDX = 1;

    IERC20Metadata public immutable base;
    ISweep public immutable sweep;
    IPriceFeed public immutable oracleBase;
    IPriceFeed public immutable sequencer;
    uint256 public immutable frequency;

    constructor(
        address _sweep,
        address _base,
        address _sequencer,
        address _oracleBase,
        uint256 _frequency
    ) {
        sweep = ISweep(_sweep);
        base = IERC20Metadata(_base);
        oracleBase = IPriceFeed(_oracleBase);
        sequencer = IPriceFeed(_sequencer);
        frequency = _frequency;

        assetIndex[_base] = USDX_IDX;
        assetIndex[_sweep] = SWEEP_IDX;
    }

    // Events
    event Bought(uint256 usdxAmount);
    event Sold(uint256 sweepAmount);

    // Errors
    error ZeroAmount();
    error BadRate();
    error NotOwnerOrGov();

    modifier onlyOwner () {
        if (msg.sender != sweep.fastMultisig() && msg.sender != sweep.owner())
            revert NotOwnerOrGov();
        _;
    }

    function getSpotPrice() public view returns (uint256) {
        uint256 returnFactor = 1e6;
        uint256 quoteFactor = 1e18;
        uint256 priceFactor = 10 ** ChainlinkLibrary.getDecimals(oracleBase);

        uint256 quote = pool.last_price(USDX_IDX);
        uint256 price = ChainlinkLibrary.getPrice(oracleBase, sequencer, frequency);

        return quote * price * returnFactor / (priceFactor * quoteFactor);
    }

    /**
     * @notice Get Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getPrice() public view returns (uint256) {
        if(address(pool) == address(0)) return 2e6;
        return getSpotPrice();
    }

    /**
     * @notice Get TWA Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getTWAPrice() external view returns (uint256) {
        uint256 returnFactor = 1e6;
        uint256 quoteFactor = 1e18;
        uint256 priceFactor = 10 ** ChainlinkLibrary.getDecimals(oracleBase);

        uint256 quote = pool.price_oracle(USDX_IDX);
        uint256 price = ChainlinkLibrary.getPrice(oracleBase, sequencer, frequency);

        return quote * price * returnFactor / (priceFactor * quoteFactor);
    }

    function getPositions(uint256)
        public view
        returns (uint256 usdxAmount, uint256 sweepAmount, uint256 lp)
    {
        usdxAmount = pool.balances(USDX_IDX);
        sweepAmount = pool.balances(SWEEP_IDX);
        lp = pool.balanceOf(address(marketMaker));
    }

    /* ========== Actions ========== */

    /**
     * @notice Buy Sweep
     * @param usdxAddress Token Address to use for buying sweep.
     * @param usdxAmount Token Amount.
     * @param amountOutMin Minimum amount out.
     * @dev Increases the sweep balance and decrease collateral balance.
     */
    function buySweep(address usdxAddress, uint256 usdxAmount, uint256 amountOutMin) 
        external returns (uint256 sweepAmount)
    {
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

    function setPool(address poolAddress) external {
        require(msg.sender == sweep.owner(), "BalancerAMM: Not Governance");
        pool = ICurvePool(poolAddress);
    }

    function checkRate(address token, uint256 tokenAmount, uint256 sweepAmount) internal view {
        if(tokenAmount == 0 || sweepAmount == 0) revert ZeroAmount();
        uint256 tokenFactor = 10 ** IERC20Metadata(token).decimals();
        uint256 sweepFactor = 10 ** sweep.decimals();
        uint256 rate = tokenAmount * sweepFactor * 1e6 / (tokenFactor * sweepAmount);
        if(rate > 16e5 || rate < 6e5) revert BadRate();
    }

    /**
     * @notice Swap tokenIn for tokenOut using balancer exact input swap
     * @param tokenIn Address to in
     * @param tokenOut Address to out
     * @param amountIn Amount of _tokenA
     * @param amountOutMin Minimum amount out.
     */
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin) 
        private returns (uint256 amountOut)
    {
        TransferHelper.safeTransferFrom(tokenIn, msg.sender, address(pool), amountIn);

        amountOut = pool.exchange_received(
            int8(assetIndex[tokenIn]),
            int8(assetIndex[tokenOut]),
            amountIn,
            amountOutMin,
            msg.sender
        );
    }

    function setMarketMaker(address _marketMaker) external onlyOwner {
        marketMaker = IMarketMaker(_marketMaker);
    }
}

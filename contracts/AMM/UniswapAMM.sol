// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ==========================================================
// ====================== UniswapAMM.sol ====================
// ==========================================================

/**
 * @title Uniswap AMM
 * @dev Interactions with UniswapV3
 */

import { IPriceFeed, ChainlinkLibrary } from  "../Libraries/Chainlink.sol";
import { ILiquidityHelper } from "../Utils/ILiquidityHelper.sol";
import { ISwapRouter } from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import { OracleLibrary } from "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";
import { TransferHelper } from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import { IUniswapV3Pool } from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IMarketMaker } from "../MarketMaker/IMarketMaker.sol";
import { ISweep } from "../Sweep/ISweep.sol";

contract UniswapAMM {
    using Math for uint256;

    ISwapRouter private immutable router;
    IERC20Metadata public immutable base;
    ISweep public immutable sweep;
    IPriceFeed public immutable oracleBase;
    IPriceFeed public immutable sequencer;
    address public pool;
    uint256 public immutable oracleBaseUpdateFrequency;
    bool private immutable flag; // The sort status of tokens
    ILiquidityHelper private immutable liquidityHelper;
    IMarketMaker public marketMaker;

    // Uniswap V3
    uint32 private constant LOOKBACK = 1 days;
    uint16 private constant DEADLINE_GAP = 15 minutes;
    uint256 private constant PRECISION = 1e6;

    constructor(
        address _sweep,
        address _base,
        address _sequencer,
        address _pool,
        address _oracleBase,
        uint256 _oracleBaseUpdateFrequency,
        address _liquidityHelper,
        address _router
    ) {
        sweep = ISweep(_sweep);
        base = IERC20Metadata(_base);
        oracleBase = IPriceFeed(_oracleBase);
        sequencer = IPriceFeed(_sequencer);
        pool = _pool;
        oracleBaseUpdateFrequency = _oracleBaseUpdateFrequency;
        liquidityHelper = ILiquidityHelper(_liquidityHelper);
        flag = _base < _sweep;
        router = ISwapRouter(_router);
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

    /**
     * @notice Get Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getPrice() public view returns (uint256 amountOut) {
        int24 tick = liquidityHelper.getCurrentTick(pool);

        uint256 quote = OracleLibrary.getQuoteAtTick(
            tick,
            uint128(10 ** sweep.decimals()),
            address(sweep),
            address(base)
        );
        uint256 price = ChainlinkLibrary.getPrice(
            oracleBase,
            sequencer,
            oracleBaseUpdateFrequency
        );

        uint8 quoteDecimals = base.decimals();
        uint8 priceDecimals = ChainlinkLibrary.getDecimals(oracleBase);

        amountOut = PRECISION.mulDiv(quote * price, 10 ** (quoteDecimals + priceDecimals));
    }

    function getPriceAtCurrentTick() public view returns (uint256) {
        int24 tick = liquidityHelper.getCurrentTick(pool);
        return getPriceAtTick(tick);
    }

    function getPriceAtTick(int24 tick) public view returns (uint256 price) {
        uint256 quote = OracleLibrary.getQuoteAtTick(
            tick,
            uint128(10 ** sweep.decimals()),
            address(sweep),
            address(base)
        );
        uint8 quoteDecimals = base.decimals();
        price = PRECISION.mulDiv(quote, 10 ** quoteDecimals);
    }

    function getTickFromPrice(uint256 price, uint8 decimals, int24 tickSpacing) public view returns (int24) {
        return liquidityHelper.getTickFromPrice(price, decimals, tickSpacing, flag);
    }

    /**
     * @notice Get TWA Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getTWAPrice() external view returns (uint256 amountOut) {
        uint256 price = ChainlinkLibrary.getPrice(
            oracleBase,
            sequencer,
            oracleBaseUpdateFrequency
        );
        // Get the average price tick first
        (int24 arithmeticMeanTick, ) = OracleLibrary.consult(pool, LOOKBACK);

        // Get the quote for selling 1 unit of a token.
        uint256 quote = OracleLibrary.getQuoteAtTick(
            arithmeticMeanTick,
            uint128(10 ** sweep.decimals()),
            address(sweep),
            address(base)
        );

        uint8 quoteDecimals = base.decimals();
        uint8 priceDecimals = ChainlinkLibrary.getDecimals(oracleBase);

        amountOut = PRECISION.mulDiv(quote * price, 10 ** (quoteDecimals + priceDecimals));
    }

    function getPositions(uint256 tokenId)
        public view
        returns (uint256 usdxAmount, uint256 sweepAmount, uint256 lp)
    {
        lp = 0;
        (uint256 amount0, uint256 amount1) = liquidityHelper.getTokenAmountsFromLP(tokenId, pool);
        (usdxAmount, sweepAmount) = flag ? (amount0, amount1) : (amount1, amount0);
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
        if (address(marketMaker) != address(0) && marketMaker.getBuyPrice() < getPrice() ) {
            TransferHelper.safeTransferFrom(address(base), msg.sender, address(this), usdxAmount);
            TransferHelper.safeApprove(address(base), address(marketMaker), usdxAmount);
            sweepAmount = marketMaker.buySweep(usdxAmount);
            TransferHelper.safeTransfer(address(sweep), msg.sender, sweepAmount);
        } else {
            checkRate(usdxAddress, usdxAmount, amountOutMin);
            sweepAmount = swap(usdxAddress, address(sweep), usdxAmount, amountOutMin, pool);
        }

        emit Bought(usdxAmount);
    }

    /**
     * @notice Sell Sweep
     * @param usdxAddress Token Address to return after selling sweep.
     * @param sweepAmount Sweep Amount.
     * @param amountOutMin Minimum amount out.
     * @dev Decreases the sweep balance and increase collateral balance
     */
    function sellSweep(address usdxAddress, uint256 sweepAmount, uint256 amountOutMin) 
        external returns (uint256 tokenAmount)
    {
        emit Sold(sweepAmount);
        checkRate(usdxAddress, amountOutMin, sweepAmount);
        tokenAmount = swap(address(sweep), usdxAddress, sweepAmount, amountOutMin, pool);
    }

    function setMarketMaker(address _marketMaker) external onlyOwner {
        marketMaker = IMarketMaker(_marketMaker);
    }

    function setPool(address poolAddress) external {
        require(msg.sender == sweep.owner(), "UniswapAMM: Not Governance");
        pool = poolAddress;
    }

    /**
     * @notice Swap tokenA into tokenB using uniV3Router.ExactInputSingle()
     * @param tokenA Address to in
     * @param tokenB Address to out
     * @param amountIn Amount of _tokenA
     * @param amountOutMin Minimum amount out.
     * @param poolAddress Pool to use in the swap
     */
    function swap(address tokenA, address tokenB, uint256 amountIn, uint256 amountOutMin, address poolAddress) 
        private returns (uint256 amountOut)
    {
        // Approval
        TransferHelper.safeTransferFrom(tokenA, msg.sender, address(this), amountIn);
        TransferHelper.safeApprove(tokenA, address(router), amountIn);

        ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenA,
                tokenOut: tokenB,
                fee: IUniswapV3Pool(poolAddress).fee(),
                recipient: msg.sender,
                deadline: block.timestamp + DEADLINE_GAP,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            });

        amountOut = router.exactInputSingle(swapParams);
    }

    function checkRate(address usdxAddress, uint256 usdxAmount, uint256 sweepAmount) internal view {
        if(usdxAmount == 0 || sweepAmount == 0) revert ZeroAmount();
        uint256 tokenFactor = 10 ** IERC20Metadata(usdxAddress).decimals();
        uint256 sweepFactor = 10 ** sweep.decimals();
        uint256 rate = usdxAmount * sweepFactor * PRECISION / (tokenFactor * sweepAmount);

        if(rate > 16e5 || rate < 6e5) revert BadRate();
    }
}

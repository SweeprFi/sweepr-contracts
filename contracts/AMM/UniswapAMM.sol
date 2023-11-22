// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ==========================================================
// ====================== UniswapAMM.sol ====================
// ==========================================================

/**
 * @title Uniswap AMM
 * @dev Interactions with UniswapV3
 */

import "../Libraries/Chainlink.sol";
import "../Utils/LiquidityHelper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import { IAMM } from "./IAMM.sol";

contract UniswapAMM is IAMM {

    ISwapRouter private constant ROUTER =
        ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    IUniswapV3Factory private constant FACTORY =
        IUniswapV3Factory(0x1F98431c8aD98523631AE4a59f267346ea31F984);

    IERC20Metadata public immutable base;
    IERC20Metadata public immutable sweep;
    IPriceFeed public immutable oracleBase;
    IPriceFeed public immutable sequencer;
    uint24 public immutable poolFee;
    uint256 public immutable oracleBaseUpdateFrequency;
    bool private immutable flag; // The sort status of tokens
    LiquidityHelper private immutable liquidityHelper;
    IUniswapQuoter private immutable quoter;

    uint8 private constant USD_DECIMALS = 6;
    // Uniswap V3
    uint32 private constant LOOKBACK = 1 days;
    uint16 private constant DEADLINE_GAP = 15 minutes;

    constructor(
        address _sweep,
        address _base,
        address _sequencer,
        uint24 _fee,
        address _oracleBase,
        uint256 _oracleBaseUpdateFrequency,
        address _liquidityHelper,
        address _quoter
    ) {
        sweep = IERC20Metadata(_sweep);
        base = IERC20Metadata(_base);
        oracleBase = IPriceFeed(_oracleBase);
        sequencer = IPriceFeed(_sequencer);
        poolFee = _fee;
        oracleBaseUpdateFrequency = _oracleBaseUpdateFrequency;
        liquidityHelper = LiquidityHelper(_liquidityHelper);
        flag = _base < _sweep;
        quoter = IUniswapQuoter(_quoter);
    }

    // Events
    event Bought(uint256 usdxAmount);
    event Sold(uint256 sweepAmount);

    function currentPrice() external returns(uint256) {
        uint256 quote = quoter.quoteExactInputSingle(
            address(sweep),
            address(base),
            poolFee,
            1e18,
            0
        );

        uint256 price = ChainlinkLibrary.getPrice(
            oracleBase,
            sequencer,
            oracleBaseUpdateFrequency
        );
        uint8 decimals = ChainlinkLibrary.getDecimals(oracleBase);

        return (quote * price) / (10 ** decimals);
    }

    /**
     * @notice Get Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getPrice() external view returns (uint256 amountOut) {
        (, int24 tick, , , , , ) = IUniswapV3Pool(
            FACTORY.getPool(address(base), address(sweep), poolFee)
        ).slot0();

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
        uint8 decimals = ChainlinkLibrary.getDecimals(oracleBase);

        amountOut = (quote * price) / (10 ** decimals);
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
        uint8 decimals = ChainlinkLibrary.getDecimals(oracleBase);

        address pool = FACTORY.getPool(address(base), address(sweep), poolFee);
        // Get the average price tick first
        (int24 arithmeticMeanTick, ) = OracleLibrary.consult(pool, LOOKBACK);

        // Get the quote for selling 1 unit of a token.
        uint256 quote = OracleLibrary.getQuoteAtTick(
            arithmeticMeanTick,
            uint128(10 ** sweep.decimals()),
            address(sweep),
            address(base)
        );

        amountOut = (quote * price) / (10 ** decimals);
    }

    function getRate() public view returns (uint256 rate) {
        rate = 1 ** sweep.decimals();
    }

    function getPositions(uint256 tokenId)
        public view
        returns (uint256 usdxAmount, uint256 sweepAmount, uint256 lp)
    {
        lp = 0;
        (uint256 amount0, uint256 amount1) = liquidityHelper
            .getTokenAmountsFromLP(tokenId, address(base), address(sweep), poolFee);
        (usdxAmount, sweepAmount) = flag ? (amount0, amount1) : (amount1, amount0);
    }

    /* ========== Actions ========== */

    /**
     * @notice Buy Sweep
     * @param tokenAddress Token Address to use for buying sweep.
     * @param tokenAmount Token Amount.
     * @param amountOutMin Minimum amount out.
     * @dev Increases the sweep balance and decrease collateral balance.
     */
    function buySweep(
        address tokenAddress,
        uint256 tokenAmount,
        uint256 amountOutMin
    ) external returns (uint256 sweepAmount) {
        emit Bought(tokenAmount);
        sweepAmount = swapExactInput(
            tokenAddress,
            address(sweep),
            poolFee,
            tokenAmount,
            amountOutMin
        );
    }

    /**
     * @notice Sell Sweep
     * @param tokenAddress Token Address to return after selling sweep.
     * @param sweepAmount Sweep Amount.
     * @param amountOutMin Minimum amount out.
     * @dev Decreases the sweep balance and increase collateral balance
     */
    function sellSweep(
        address tokenAddress,
        uint256 sweepAmount,
        uint256 amountOutMin
    ) external returns (uint256 tokenAmount) {
        emit Sold(sweepAmount);
        tokenAmount = swapExactInput(
            address(sweep),
            tokenAddress,
            poolFee,
            sweepAmount,
            amountOutMin
        );
    }

    /**
     * @notice Swap tokenA into tokenB using uniV3Router.ExactInputSingle()
     * @param tokenA Address to in
     * @param tokenB Address to out
     * @param amountIn Amount of _tokenA
     * @param amountOutMin Minimum amount out.
     */
    function swapExactInput(
        address tokenA,
        address tokenB,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMin
    ) public returns (uint256 amountOut) {
        // Approval
        TransferHelper.safeTransferFrom(
            tokenA,
            msg.sender,
            address(this),
            amountIn
        );
        TransferHelper.safeApprove(tokenA, address(ROUTER), amountIn);

        ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenA,
                tokenOut: tokenB,
                fee: fee,
                recipient: msg.sender,
                // TODO: will this hardcoded 200 work for every network?
                deadline: block.timestamp + DEADLINE_GAP,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            });

        amountOut = ROUTER.exactInputSingle(swapParams);
    }
}

interface IUniswapQuoter {
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external returns(uint256 amountOut);
}
// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ==========================================================
// ====================== UniswapAMM.sol ====================
// ==========================================================

/**
 * @title Uniswap AMM
 * @dev Interactions with UniswapV3
 */

import "../Oracle/ChainlinkPricer.sol";

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract UniswapAMM {
    using Math for uint256;

    uint8 private constant USD_DECIMALS = 6;

    // Uniswap V3
    uint32 private constant LOOKBACK = 1 days;
    uint16 private constant DEADLINE_GAP = 15 minutes;

    ISwapRouter private constant ROUTER =
        ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    IUniswapV3Factory private constant FACTORY =
        IUniswapV3Factory(0x1F98431c8aD98523631AE4a59f267346ea31F984);

    address public immutable sequencer;
    uint24 public immutable poolFee;
    IERC20Metadata public immutable baseToken;
    address public immutable baseUSDOracle;
    uint256 public immutable baseUSDOracleUpdateFrequency;

    address public immutable sweepAddress;

    constructor(
        address sweepAddress_,
        address sequencerAddress_,
        uint24 poolFee_,
        IERC20Metadata baseToken_,
        address baseOracle,
        uint256 baseOracleUpdateFrequency
    ) {
        sweepAddress = sweepAddress_;
        sequencer = sequencerAddress_;
        poolFee = poolFee_;
        baseToken = baseToken_;
        baseUSDOracle = baseOracle;
        baseUSDOracleUpdateFrequency = baseOracleUpdateFrequency;
    }

    event Bought(uint256 usdxAmount);
    event Sold(uint256 sweepAmount);
    event PoolFeeChanged(uint24 poolFee);

    error OverZero();

    /**
     * @notice Get Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getPrice() external view returns (uint256 amountOut) {
        (, int24 tick, , , , , ) = IUniswapV3Pool(
            FACTORY.getPool(address(baseToken), sweepAddress, poolFee)
        ).slot0();

        uint256 quote = OracleLibrary.getQuoteAtTick(
            tick,
            uint128(10 ** IERC20Metadata(sweepAddress).decimals()),
            sweepAddress,
            address(baseToken)
        );

        (int256 price, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            baseUSDOracle,
            sequencer,
            baseUSDOracleUpdateFrequency
        );

        amountOut = quote.mulDiv(uint256(price), 10 ** decimals);
    }

    /**
     * @notice Get TWA Price
     * @dev Get the quote for selling 1 unit of a token.
     */

    function getTWAPrice() external view returns (uint256 amountOut) {
        (int256 price, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            baseUSDOracle,
            sequencer,
            baseUSDOracleUpdateFrequency
        );

        address pool = FACTORY.getPool(
            address(baseToken),
            sweepAddress,
            poolFee
        );
        // Get the average price tick first
        (int24 arithmeticMeanTick, ) = OracleLibrary.consult(pool, LOOKBACK);

        // Get the quote for selling 1 unit of a token.
        uint256 quote = OracleLibrary.getQuoteAtTick(
            arithmeticMeanTick,
            uint128(10 ** IERC20Metadata(sweepAddress).decimals()),
            sweepAddress,
            address(baseToken)
        );

        amountOut = quote.mulDiv(uint256(price), 10 ** decimals);
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
            sweepAddress,
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
            sweepAddress,
            tokenAddress,
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
                fee: poolFee,
                recipient: msg.sender,
                // TODO: will this hardcoded 200 work for every network?
                deadline: block.timestamp + DEADLINE_GAP,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            });

        amountOut = ROUTER.exactInputSingle(swapParams);
    }

    /**
     * @notice Calculate the amount USD that are equivalent to the USDX input.
     **/
    function tokenToUSD(
        uint256 tokenAmount
    ) external view returns (uint256 usdAmount) {
        (int256 price, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            baseUSDOracle,
            sequencer,
            baseUSDOracleUpdateFrequency
        );

        usdAmount = tokenAmount.mulDiv(
            (10 ** USD_DECIMALS) * uint256(price),
            10 ** (decimals + baseToken.decimals())
        );
    }

    /**
     * @notice Calculate the amount USDX that are equivalent to the USD input.
     **/
    function usdToToken(
        uint256 usdAmount
    ) external view returns (uint256 tokenAmount) {
        (int256 price, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            baseUSDOracle,
            sequencer,
            baseUSDOracleUpdateFrequency
        );

        tokenAmount = usdAmount.mulDiv(
            10 ** (decimals + baseToken.decimals()),
            (10 ** USD_DECIMALS) * uint256(price)
        );
    }
}

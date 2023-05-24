// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ==========================================================
// ====================== UniswapAMM ========================
// ==========================================================

/**
 * @title Uniswap AMM
 * @dev Interactions with UniswapV3
 */

import "../Common/Owned.sol";
import "../Oracle/ChainlinkPricer.sol";

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract UniswapAMM {
    using Math for uint256;

    uint8 public constant USD_DECIMALS = 6;
    // Uniswap V3
    uint32 public constant LOOKBACK = 3600 * 24; // seconds
    ISwapRouter public constant ROUTER = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    IUniswapV3Factory public constant FACTORY = IUniswapV3Factory(0x1F98431c8aD98523631AE4a59f267346ea31F984);

    address public immutable sequencer;
    uint24 public immutable poolFee;
    IERC20Metadata public immutable baseToken;
    address public immutable baseUSDOracle;
    uint256 public immutable baseUSDOracleUpdateFrequency;

    address public immutable sweepAddress;

    constructor(
        address _sweepAddress,
        address _sequencer,
        uint24 _poolFee,
        IERC20Metadata _baseToken,
        address _baseUSDOracle,
        uint256 _baseUSDOracleUpdateFrequency
    ) {
        sweepAddress = _sweepAddress;
        sequencer = _sequencer;
        poolFee = _poolFee;
        baseToken = _baseToken;
        baseUSDOracle = _baseUSDOracle;
        baseUSDOracleUpdateFrequency = _baseUSDOracleUpdateFrequency;
    }

    event Bought(uint256 usdx_amount);
    event Sold(uint256 sweep_amount);
    event PoolFeeChanged(uint24 poolFee);

    error OverZero();

    /**
     * @notice Get Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getPrice() external view returns (uint256 amountOut) {
        (, int24 tick, , , , , ) = IUniswapV3Pool(FACTORY.getPool(address(baseToken), sweepAddress, poolFee)).slot0();

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

        address pool = FACTORY.getPool(address(baseToken), sweepAddress, poolFee);
        // Get the average price tick first
        (int24 arithmeticMeanTick, ) = OracleLibrary.consult(
            pool,
            LOOKBACK
        );

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
     * @param _baseToken Token Address to use for buying sweep.
     * @param tokenAmount Token Amount.
     * @param amountOutMin Minimum amount out.
     * @dev Increases the sweep balance and decrease collateral balance.
     */
    function buySweep(
        address _baseToken,
        uint256 tokenAmount,
        uint256 amountOutMin
    ) external returns (uint256 sweepAmount) {
        emit Bought(tokenAmount);
        sweepAmount = swapExactInput(
            _baseToken,
            sweepAddress,
            tokenAmount,
            amountOutMin
        );
    }

    /**
     * @notice Sell Sweep
     * @param _baseToken Token Address to return after selling sweep.
     * @param sweepAmount Sweep Amount.
     * @param amountOutMin Minimum amount out.
     * @dev Decreases the sweep balance and increase collateral balance
     */
    function sellSweep(
        address _baseToken,
        uint256 sweepAmount,
        uint256 amountOutMin
    ) external returns (uint256 tokenAmount) {
        emit Sold(sweepAmount);
        tokenAmount = swapExactInput(
            sweepAddress,
            _baseToken,
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
                deadline: block.timestamp + 200,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            });

        amountOut = ROUTER.exactInputSingle(swapParams);
    }

    /**
     * @notice Calculate the amount USD that are equivalent to the USDX input.
     **/
    function tokenToUSD(uint256 tokenAmount) external view returns (uint256 usdAmount) {
        (int256 price, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            baseUSDOracle,
            sequencer,
            baseUSDOracleUpdateFrequency
        );

        usdAmount = tokenAmount.mulDiv((10 ** USD_DECIMALS) * uint256(price), 10 ** (decimals + baseToken.decimals()));
    }

    /**
     * @notice Calculate the amount USDX that are equivalent to the USD input.
     **/
    function USDtoToken(uint256 usdAmount) external view returns (uint256 tokenAmount) {
        (int256 price, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            baseUSDOracle,
            sequencer,
            baseUSDOracleUpdateFrequency
        );

        tokenAmount = usdAmount.mulDiv(10 ** (decimals + baseToken.decimals()), (10 ** USD_DECIMALS) * uint256(price));
    }
}

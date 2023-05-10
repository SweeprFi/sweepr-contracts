// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

// ====================================================================
// ========================= UniswapOracle.sol ========================
// ====================================================================

/**
 * @title UniswapOracle
 * @dev fetches the current price in the AMM
 */

import "../Utils/Math/SafeMath.sol";
import "../Utils/Uniswap/V3/IUniswapV3Pool.sol";
import "../Utils/Uniswap/V3/libraries/OracleLibrary.sol";
import '../Utils/Uniswap/V3/libraries/FullMath.sol';
import '../Utils/Uniswap/V3/libraries/FixedPoint128.sol';
import "../Common/Owned.sol";
import "../Common/ERC20/IERC20Metadata.sol";
import "../Oracle/AggregatorV3Interface.sol";

contract UniswapOracle is Owned {
    using SafeMath for uint256;

    // Core
    IUniswapV3Pool public pool;
    IERC20Metadata public base_token;
    IERC20Metadata public pricing_token;

    // AggregatorV3Interface stuff
    string public description = "Uniswap Oracle";
    uint256 public version = 1;
    AggregatorV3Interface private immutable usd_oracle;

    uint32 public lookback_secs = 3600 * 24; // 1 day

    /* ========== Errors ========== */
    error ZeroPrice();
    error StalePrice();

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _sweep_address, 
        address _pool_address,
        address _usd_oracle_address
    ) Owned(_sweep_address) {
        _setUniswapPool(_pool_address);
        usd_oracle = AggregatorV3Interface(_usd_oracle_address);
    }

    /* ========== VIEWS ========== */

    /**
     * @notice Token symbols
     */
    function token_symbols()
        external
        view
        returns (string memory base, string memory pricing)
    {
        base = base_token.symbol();
        pricing = pricing_token.symbol();
    }

    /**
     * @notice Get Liquidity
     * @dev Returns the balance of the pool without the unclaimed fees.     
     */
    function getLiquidity() 
        public
        view
        returns (uint256 sweep_amount, uint256 usdx_amount) 
    {
        (uint128 sweep_fee_Amount, uint128 usdx_fee_amount) = getUnclaimedFeeAmount();
        return (
            IERC20Metadata(pricing_token).balanceOf(address(pool)) - uint256(sweep_fee_Amount),
            IERC20Metadata(base_token).balanceOf(address(pool)) - uint256(usdx_fee_amount)
        );
    }

    /**
     * @notice Get Unclaimed Fee Amount
     * @dev Returns the fees that are not claimed for the pool configured in the protocol
     */
    function getUnclaimedFeeAmount()
        public 
        view
        returns (uint128 sweep_amount, uint128 usdx_amount) 
    {
        uint256 global0FeeAmount;
        uint256 global1FeeAmount;

        if (pool.token0() == address(base_token)) {
            global0FeeAmount = pool.feeGrowthGlobal0X128();
            global1FeeAmount = pool.feeGrowthGlobal1X128();
        } else {
            global0FeeAmount = pool.feeGrowthGlobal1X128();
            global1FeeAmount = pool.feeGrowthGlobal0X128();
        }

        usdx_amount =
            uint128(
                FullMath.mulDiv(
                    global0FeeAmount,
                    pool.liquidity(),
                    FixedPoint128.Q128
                )
            );

        sweep_amount =
            uint128(
                FullMath.mulDiv(
                    global1FeeAmount,
                    pool.liquidity(),
                    FixedPoint128.Q128
                )
            );
    }

    /**
     * @notice Get Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getPrice() public view returns (uint256 amount_out) {
        (uint160 sqrtRatioX96, , , , , , ) = pool.slot0();
        (, int256 price, , uint256 updatedAt, ) = usd_oracle.latestRoundData();

        if(price == 0) revert ZeroPrice();
        if(updatedAt < block.timestamp - 1 hours) revert StalePrice();

        uint256 quote = getQuote(
            sqrtRatioX96,
            uint128(10**pricing_token.decimals()),
            address(pricing_token),
            address(base_token)
        );

        amount_out = (quote * uint256(price)) / (10 ** (usd_oracle.decimals()));
    }

    /**
     * @notice Get TWA Price
     * @dev Get the quote for selling 1 unit of a token.
     */

    function getTWAPrice() public view returns (uint256 amount_out) {
        (, int256 price, , uint256 updatedAt, ) = usd_oracle.latestRoundData();
        if(price == 0) revert ZeroPrice();
        if(updatedAt < block.timestamp - 1 hours) revert StalePrice();

        // Get the average price tick first
        (int24 arithmeticMeanTick, ) = OracleLibrary.consult(
            address(pool),
            lookback_secs
        );

        // Get the quote for selling 1 unit of a token.
        uint256 quote = OracleLibrary.getQuoteAtTick(
            arithmeticMeanTick,
            uint128(10**pricing_token.decimals()),
            address(pricing_token),
            address(base_token)
        );

        amount_out = (quote * uint256(price)) / (10 ** (usd_oracle.decimals()));
    }

    /**
     * @notice Get Quote
     * @dev Calculates the amount of quoteToken equivalent to a given amount of baseToken
     * based on the current prices of the two tokens.
     */
    function getQuote(
        uint160 sqrtRatioX96,
        uint128 baseAmount,
        address baseToken,
        address quoteToken
    ) public pure returns (uint256 quoteAmount) {
        // Calculate quoteAmount with better precision if it doesn't overflow when multiplied by itself
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX192, baseAmount, 1 << 192)
                : FullMath.mulDiv(1 << 192, baseAmount, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX128, baseAmount, 1 << 128)
                : FullMath.mulDiv(1 << 128, baseAmount, ratioX128);
        }
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    /**
     * @notice Set Uniswap Pool
     * @param _pool_address New pool.
     */
    function setUniswapPool(address _pool_address) public onlyAdmin {
        _setUniswapPool(_pool_address);
    }

    /**
     * @notice Increase observation cardinality
     * @param _num_cardinals New cardinals.
     */
    function increaseObservationCardinality(uint16 _num_cardinals)
        external
        onlyAdmin
    {
        pool.increaseObservationCardinalityNext(_num_cardinals);
    }

    /**
     * @notice Set lookback_sec
     * @param _seconds New seconds.
     */
    function setTWAPLookbackSec(uint32 _seconds) external onlyAdmin {
        lookback_secs = _seconds;
    }

    /**
     * @notice Toggle Token For Pricing
     * @dev Toggles the token address between the base token and the quote token.
     */
    function toggleTokenForPricing() external onlyAdmin {
        IERC20Metadata aux = base_token;
        base_token = pricing_token;
        pricing_token = aux;
    }

    /* ========== INTERNALS ========== */

    function _setUniswapPool(address _pool_address) internal {
        pool = IUniswapV3Pool(_pool_address);
        base_token = IERC20Metadata(pool.token0());
        pricing_token = IERC20Metadata(pool.token1());
    }
}

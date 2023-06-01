// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= MarketMaker.sol ========================
// ====================================================================

/**
 * @title MarketMaker
 * @dev Implementation:
 Simple marketmaker (buy & sell SWEEP)
 AMM marketmaker (single-sided liquidity)
 */

import "../Stabilizer/Stabilizer.sol";
import "../Utils/LiquidityHelper.sol";

contract MarketMaker is Stabilizer {
    address public token0;
    address public token1;
    bool private immutable flag; // The sort status of tokens

    // Uniswap V3 Position Manager
    INonfungiblePositionManager public constant nonfungiblePositionManager =
        INonfungiblePositionManager(0xC36442b4a4522E871399CD717aBDD847Ab11FE88);
    LiquidityHelper private immutable liquidityHelper;

    // Variables
    uint256 public top_spread;
    uint256 public bottom_spread;

    // Constants
    uint24 private constant PRECISION = 1e6;

    // Events
    event Minted(uint256 tokenId, uint128 liquidity);
    event Burned(uint256 tokenId);

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _liquidityHelper,
        address _borrower,
        uint256 _top_spread,
        uint256 _bottom_spread
    )
        Stabilizer(
            _name,
            _sweep_address,
            _usdx_address,
            _borrower
        )
    {
        flag = _usdx_address < _sweep_address;

        (token0, token1) = flag
            ? (_usdx_address, _sweep_address)
            : (_sweep_address, _usdx_address);

        liquidityHelper = LiquidityHelper(_liquidityHelper);

        min_equity_ratio = 0;

        top_spread = _top_spread;
        bottom_spread = _bottom_spread;
    }

    /* ========== Simple Marketmaker Actions ========== */

    /**
     * @notice Execute operation to peg to target price of SWEEP.
     */
    function execute(uint256 _sweep_amount) public onlyBorrower {
        uint256 arb_price_upper = ((PRECISION + top_spread) * SWEEP.target_price()) / PRECISION;
        uint256 arb_price_lower = ((PRECISION - bottom_spread) * SWEEP.target_price()) / PRECISION;

        (uint256 usdc_balance, ) = _balances();

        if (SWEEP.amm_price() < arb_price_lower && usdc_balance > 0) {
            buySweep(_sweep_amount);
        }

        if (SWEEP.amm_price() > arb_price_upper) {
            sellSweep(_sweep_amount);
        }
    }

    /**
     * @notice Sell Sweep.
     * @param _sweep_amount to sell.
     */
    function sellSweep(uint256 _sweep_amount) internal {
        uint256 sweep_limit = SWEEP.minters(address(this)).max_amount;
        uint256 sweep_available = sweep_limit - sweep_borrowed;
        if (_sweep_amount > sweep_available) _sweep_amount = sweep_available;

        _borrow(_sweep_amount);
        _sell(_sweep_amount, 0);
    }

    /**
     * @notice Buy Sweep.
     * @param _sweep_amount to buy.
     */
    function buySweep(uint256 _sweep_amount) internal {
        (uint256 usdx_balance, ) = _balances();

        uint256 usdc_amount = amm.USDtoToken(SWEEP.convertToUSD(_sweep_amount));
        if (usdc_amount > usdx_balance) usdc_amount = usdx_balance;

        uint256 sweep_amount = _buy(usdc_amount, 0);
        _repay(sweep_amount);
    }

    /**
     * @notice Update top_spread.
     * @param _top_spread new top_spread.
     */
    function setTopSpread(
        uint256 _top_spread
    ) external onlyBorrower onlySettingsEnabled {
        top_spread = _top_spread;
    }

    /**
     * @notice Update bottom_spread.
     * @param _bottom_spread new bottom_spread.
     */
    function setBottomSpread(
        uint256 _bottom_spread
    ) external onlyBorrower onlySettingsEnabled {
        bottom_spread = _bottom_spread;
    }
}

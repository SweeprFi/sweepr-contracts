// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

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
import "../Oracle/UniswapOracle.sol";

contract MarketMaker is Stabilizer {
    // Variables
    uint256 public top_spread;
    uint256 public bottom_spread;

    // Constants
    uint24 private constant PRECISION = 1e6;

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _amm_address,
        address _borrower,
        uint256 _top_spread,
        uint256 _bottom_spread
    )
        Stabilizer(
            _name,
            _sweep_address,
            _usdx_address,
            _amm_address,
            _borrower
        )
    {
        min_equity_ratio = 0;

        top_spread = _top_spread;
        bottom_spread = _bottom_spread;
    }

    /* ========== Actions ========== */

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
            sellSweep(sweep_amount);
        }
    }

    /**
     * @notice Sell Sweep.
     * @param _sweep_amount to mint.
     */
    function sellSweep(uint256 _sweep_amount) internal {
        uint256 sweep_limit = SWEEP.minters(address(this)).max_amount;
        uint256 sweep_available = sweep_limit - sweep_borrowed;
        _sweep_amount = _min(_sweep_amount, sweep_available);

        _borrow(_sweep_amount);
        _sell(_sweep_amount, 0);
    }

    /**
     * @notice Buy Sweep.
     * @param _usdc_amount to mint.
     */
    function buySweep(uint256 _sweep_amount) internal {
        (uint256 usdx_balance, ) = _balances();

        uint256 usdc_amount = SWEEP.convertToUSD(_sweep_amount);
        usdc_amount = _min(usdc_amount, usdx_balance);
        _buy(_usdc_amount, 0);
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

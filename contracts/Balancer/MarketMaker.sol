// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;
pragma experimental ABIEncoderV2;

// ====================================================================
// ========================= OffChainAsset.sol ========================
// ====================================================================

/**
 * @title Off Chain Asset
 * @dev Representation of an off-chain investment
 */

import "../Stabilizer/Stabilizer.sol";
import "../Oracle/UniswapOracle.sol";

contract MarketMaker is Stabilizer {
    // Uniswap oracle
    UniswapOracle public uniswapOracle;
    address public sweep_usdc_oracle_address;

    // Variables
    uint256 public top_spread;
    uint256 public bottom_spread;

    // Constants
    uint24 private constant PRECISION = 1e6;

    // Events
    event SweepSold(uint256 indexed sweep_amount);
    event SweepBought(uint256 indexed usdc_amount);
    event UniswapOracleSet(address uniswap_oracle_address);

    // Errors
    error OnlyCollateralAgent();

    /* ========== Modifies ========== */

    modifier onlyCollateralAgent() {
        if (msg.sender != sweep.collateral_agency())
            revert OnlyCollateralAgent();
        _;
    }

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _amm_address,
        address _borrower,
        address _oracle_address,
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

        sweep_usdc_oracle_address = _oracle_address;
        uniswapOracle = UniswapOracle(_oracle_address);
    }

    /* ========== Actions ========== */

    /**
     * @notice Execute operation to peg to target price of SWEEP.
     */
    function execute() public onlyBorrower {
        uint256 arb_price_upper = ((PRECISION + top_spread) * sweep.target_price()) / PRECISION;
        uint256 arb_price_lower = ((PRECISION - bottom_spread) * sweep.target_price()) / PRECISION;

        (uint256 usdc_balance, ) = _balances();

        if (sweep.amm_price() < arb_price_lower && usdc_balance > 0) {
            uint256 usdc_amount = uniswapOracle.getPegAmountsForCall();
            buySweep(usdc_amount);
        }

        if (sweep.amm_price() > arb_price_upper) {
            uint256 sweep_amount = uniswapOracle.getPegAmountsForInvest();
            sellSweep(sweep_amount);
        }
    }

    /**
     * @notice Sell Sweep.
     * @param _sweep_amount to mint.
     */
    function sellSweep(uint256 _sweep_amount) internal {
        uint256 sweep_limit = sweep.minters(address(this)).max_amount;
        uint256 sweep_available = sweep_limit - sweep_borrowed;
        _sweep_amount = _min(_sweep_amount, sweep_available);

        _borrow(_sweep_amount);
        _sell(_sweep_amount, 0);

        emit SweepSold(_sweep_amount);
    }

    /**
     * @notice Buy Sweep.
     * @param _usdc_amount to mint.
     */
    function buySweep(uint256 _usdc_amount) internal {
        (uint256 usdx_balance, ) = _balances();

        _usdc_amount = _min(_usdc_amount, usdx_balance);
        _buy(_usdc_amount, 0);

        emit SweepBought(_usdc_amount);
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

    /**
     * @notice Set Uniswap Oracle
     * @param _uniswap_oracle_address.
     */
    function setUniswapOracle(
        address _uniswap_oracle_address
    ) public onlyBorrower onlySettingsEnabled {
        if (_uniswap_oracle_address == address(0)) revert ZeroAddressDetected();
        sweep_usdc_oracle_address = _uniswap_oracle_address;
        uniswapOracle = UniswapOracle(_uniswap_oracle_address);

        emit UniswapOracleSet(_uniswap_oracle_address);
    }
}

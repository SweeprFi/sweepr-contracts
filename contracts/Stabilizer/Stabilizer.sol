// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ====================== Stabilizer.sol ==============================
// ====================================================================

/**
 * @title Stabilizer
 * @dev Implementation:
 * Allows to take debt by minting sweep and repaying by burning sweep
 * Allows to buy and sell sweep in an AMM
 * Allows auto invest according the borrower configuration
 * Allows auto repays by the balancer to control sweep price
 * Allow liquidate the Asset when is defaulted
 * Repayments made by burning sweep
 * EquityRatio = Junior / (Junior + Senior)
 */

import "../Sweep/ISweep.sol";
import "../AMM/IAMM.sol";
import "../Oracle/ChainlinkPricer.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "../Common/Owned.sol";

contract Stabilizer is Owned, Pausable {
    // Variables
    string public name;
    address public borrower;
    int256 public min_equity_ratio; // Minimum Equity Ratio. 10000 is 1%
    uint256 public sweep_borrowed;
    uint256 public loan_limit;

    uint256 public call_time;
    uint256 public call_delay; // 86400 is 1 day
    uint256 public call_amount;

    uint256 public spread_fee; // 10000 is 1%
    uint256 public spread_date;
    uint256 public liquidator_discount; // 10000 is 1%
    string public link;

    int256 public auto_invest_min_ratio; // 10000 is 1%
    uint256 public auto_invest_min_amount;
    bool public auto_invest;

    bool public settings_enabled;

    IAMM public amm;
    ChainlinkPricer private usd_oracle;

    // Tokens
    IERC20Metadata public usdx;

    // Constants for various precisions
    uint256 private constant DAY_SECONDS = 60 * 60 * 24; // seconds of Day
    uint256 private constant TIME_ONE_YEAR = 365 * DAY_SECONDS; // seconds of Year
    uint256 private constant PRECISION = 1e6;
    uint256 private constant USDC_FREQUENCY = 1 days;

    /* ========== Events ========== */

    event Borrowed(uint256 indexed sweep_amount);
    event Repaid(uint256 indexed sweep_amount);
    event Withdrawn(address indexed token, uint256 indexed amount);
    event PayFee(uint256 indexed sweep_amount);
    event Bought(uint256 indexed sweep_amount);
    event Sold(uint256 indexed sweep_amount);
    event BoughtSWEEP(uint256 indexed sweep_amount);
    event SoldSWEEP(uint256 indexed usdx_amount);
    event LoanLimitChanged(uint256 loan_limit);
    event BorrowerChanged(address indexed borrower);
    event Proposed(address indexed borrower);
    event Rejected(address indexed borrower);

    event Invested(uint256 indexed usdx_amount, uint256 indexed sweep_amount);
    event Divested(uint256 indexed usdx_amount, uint256 indexed sweep_amount);
    event Liquidated(address indexed user);

    event AutoCalled(uint256 indexed sweep_amount);
    event AutoInvested(uint256 indexed sweep_amount);
    event CallCancelled(uint256 indexed sweep_amount);

    event ConfigurationChanged(
        int256 indexed min_equity_ratio,
        uint256 indexed spread_fee,
        uint256 loan_limit,
        uint256 liquidator_discount,
        uint256 call_delay,
        int256 auto_invest_min_ratio,
        uint256 auto_invest_min_amount,
        bool auto_invest,
        string url_link
    );

    /* ========== Errors ========== */
    error OnlyBorrower();
    error OnlyBalancer();
    error SettingsDisabled();
    error OverZero();
    error InvalidMinter();
    error NotEnoughBalance();
    error EquityRatioExcessed();
    error InvalidToken();
    error SpreadNotEnough();
    error NotDefaulted();
    error ZeroPrice();
    error StalePrice();
    error NotAutoInvest();
    error NotAutoInvesMinAMount();
    error NotAutoInvestMinRatio();
    error SequencerDown();

    /* ========== Modifies ========== */
    modifier onlyBorrower() {
        if (msg.sender != borrower) revert OnlyBorrower();
        _;
    }

    modifier onlyBalancer() {
        if (msg.sender != SWEEP.balancer()) revert OnlyBalancer();
        _;
    }

    modifier onlySettingsEnabled() {
        if (!settings_enabled) revert SettingsDisabled();
        _;
    }

    modifier validAddress(address _addr) {
        if (_addr == address(0)) revert ZeroAddressDetected();
        _;
    }

    modifier validAmount(uint256 _amount) {
        if (_amount == 0) revert OverZero();
        _;
    }

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _amm_address,
        address _borrower
    ) Owned(_sweep_address) {
        name = _name;
        usdx = IERC20Metadata(_usdx_address);
        amm = IAMM(_amm_address);
        borrower = _borrower;
        settings_enabled = true;
        usd_oracle = new ChainlinkPricer(amm.usdOracle(), amm.sequencerUptimeFeed());
    }

    /* ========== Views ========== */

    /**
     * @notice Defaulted
     * @return bool that tells if stabilizer is in default.
     */
    function isDefaulted() public view returns (bool) {
        return
            (call_amount > 0 && block.timestamp > call_time) ||
            (sweep_borrowed > 0 && getEquityRatio() < min_equity_ratio);
    }

    /**
     * @notice Get Equity Ratio
     * @return the current equity ratio based in the internal storage.
     * @dev this value have a precision of 6 decimals.
     */
    function getEquityRatio() public view returns (int256) {
        return _calculateEquityRatio(0, 0);
    }

    /**
     * @notice Get Spread Amount
     * fee = borrow_amount * spread_ratio * (time / time_per_year)
     * @return uint256 calculated spread amount.
     */
    function accruedFee() public view returns (uint256) {
        if (sweep_borrowed == 0) return 0;
        else {
            uint256 period = block.timestamp - spread_date;
            return
                (sweep_borrowed * spread_fee * period) /
                (TIME_ONE_YEAR * PRECISION);
        }
    }

    /**
     * @notice Get Debt Amount
     * debt = borrow_amount + spread fee
     * @return uint256 calculated debt amount.
     */
    function getDebt() public view returns (uint256) {
        return sweep_borrowed + accruedFee();
    }

    /**
     * @notice Get Current Value
     * value = sweep balance + usdx balance
     * @return uint256.
     */
    function currentValue() public view virtual returns (uint256) {
        (uint256 usdx_balance, uint256 sweep_balance) = _balances();
        uint256 sweep_balance_in_usd = SWEEP.convertToUSD(sweep_balance);
        uint256 accrued_fee_in_usd = SWEEP.convertToUSD(accruedFee());

        return (_USDXtoUSD(usdx_balance) + sweep_balance_in_usd - accrued_fee_in_usd);
    }

    /**
     * @notice Get Junior Tranche Value
     * @return int256 calculated junior tranche amount.
     */
    function getJuniorTrancheValue() external view returns (int256) {
        uint256 senior_tranche_in_usdx = SWEEP.convertToUSD(sweep_borrowed);
        uint256 total_value = currentValue();

        return int256(total_value) - int256(senior_tranche_in_usdx);
    }

    /**
     * @notice Returns the SWEEP required to liquidate the stabilizer
     * @return uint256
     */
    function getLiquidationValue() public view returns (uint256) {
        return
            accruedFee() + SWEEP.convertToSWEEP(
                (currentValue() * (1e6 - liquidator_discount)) / PRECISION
            );
    }

    /* ========== Settings ========== */

    /**
     * @notice Set Borrower
     * @param _borrower.
     * @dev Who manages the investment actions.
     */
    function setBorrower(
        address _borrower
    ) external onlyAdmin validAddress(_borrower) {
        borrower = _borrower;
        settings_enabled = true;

        emit BorrowerChanged(_borrower);
    }

    /**
     * @notice Pause
     * @dev Stops investment actions.
     */
    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }

    /**
     * @notice Configure intial settings
     * @param _min_equity_ratio The minimum equity ratio can be negative.
     * @param _spread_fee The fee that the protocol will get for providing the loan when the stabilizer takes debt
     * @param _loan_limit How much debt a Stabilizer can take in SWEEP.
     * @param _liquidator_discount A percentage that will be discounted in favor to the liquidator when the stabilizer is liquidated
     * @param _call_delay Time in seconds after AutoCall until the Stabilizer gets defaulted if the debt is not paid in that period
     * @param _auto_invest_min_ratio Minimum equity ratio that should be kept to allow the execution of an auto invest
     * @param _auto_invest_min_amount Minimum amount to be invested to allow the execution of an auto invest
     * @param _auto_invest Represents if an auto invest execution is allowed or not
     * @param _link A URL link to a Web page that describes the borrower and the asset
     * @dev Sets the initial configuration of the Stabilizer.
     * This configuration will be analyzed by the protocol and if accepted,
     * used to include the Stabilizer in the minter's whitelist of Sweep.
     */
    function configure(
        int256 _min_equity_ratio,
        uint256 _spread_fee,
        uint256 _loan_limit,
        uint256 _liquidator_discount,
        uint256 _call_delay,
        int256 _auto_invest_min_ratio,
        uint256 _auto_invest_min_amount,
        bool _auto_invest,
        string calldata _link
    ) external onlyBorrower onlySettingsEnabled {
        min_equity_ratio = _min_equity_ratio;
        spread_fee = _spread_fee;
        loan_limit = _loan_limit;
        liquidator_discount = _liquidator_discount;
        call_delay = _call_delay;
        auto_invest_min_ratio = _auto_invest_min_ratio;
        auto_invest_min_amount = _auto_invest_min_amount;
        auto_invest = _auto_invest;
        link = _link;

        emit ConfigurationChanged(
            _min_equity_ratio,
            _spread_fee,
            _loan_limit,
            _liquidator_discount,
            _call_delay,
            _auto_invest_min_ratio,
            _auto_invest_min_amount,
            _auto_invest,
            _link
        );
    }

    /**
     * @notice Changes the account that control the global configuration to the protocol/governance admin
     * @dev after disable settings by admin
     * the protocol will evaluate adding the stabilizer to the minter list.
     */
    function propose() external onlyBorrower {
        settings_enabled = false;

        emit Proposed(borrower);
    }

    /**
     * @notice Changes the account that control the global configuration to the borrower
     * @dev after enable settings for the borrower
     * he/she should edit the values to align to the protocol requirements
     */
    function reject() external onlyAdmin {
        settings_enabled = true;

        emit Rejected(borrower);
    }

    /* ========== Actions ========== */

    /**
     * @notice Borrows Sweep
     * Asks the stabilizer to mint a certain amount of sweep token.
     * @param _sweep_amount.
     * @dev Increases the sweep_borrowed (senior tranche).
     */
    function borrow(
        uint256 _sweep_amount
    ) external onlyBorrower whenNotPaused validAmount(_sweep_amount) {
        if (!SWEEP.isValidMinter(address(this))) revert InvalidMinter();

        uint256 sweep_available = loan_limit - sweep_borrowed;
        if (sweep_available < _sweep_amount) revert NotEnoughBalance();

        int256 current_equity_ratio = _calculateEquityRatio(_sweep_amount, 0);
        if (current_equity_ratio < min_equity_ratio)
            revert EquityRatioExcessed();

        _borrow(_sweep_amount);
    }

    /**
     * @notice Repays Sweep
     * Burns the sweep_amount to reduce the debt (senior tranche).
     * @param _sweep_amount Amount to be burnt by Sweep.
     * @dev Decreases the sweep borrowed.
     */
    function repay(uint256 _sweep_amount) external onlyBorrower {
        _repay(_sweep_amount);
    }

    /**
     * @notice Pay the spread to the treasury
     */
    function payFee() external onlyBorrower {
        uint256 spread_amount = accruedFee();
        spread_date = block.timestamp;

        (, uint256 sweep_balance) = _balances();

        if (spread_amount > sweep_balance) revert SpreadNotEnough();

        if (spread_amount > 0) {
            TransferHelper.safeTransfer(
                address(SWEEP),
                SWEEP.treasury(),
                spread_amount
            );

            emit PayFee(spread_amount);
        }
    }

    /**
     * @notice Set Loan Limit.
     * @param _new_loan_limit.
     * @dev How much debt an Stabilizer can take in SWEEP.
     */
    function setLoanLimit(uint256 _new_loan_limit) external onlyBalancer {
        loan_limit = _new_loan_limit;

        emit LoanLimitChanged(_new_loan_limit);
    }

    /**
     * @notice Auto Call.
     * @param _sweep_amount to repay.
     * @dev Strategy:
     * 1) repays debt with SWEEP balance
     * 2) repays remaining debt by divesting
     * 3) repays remaining debt by buying on SWEEP in the AMM
     */
    function autoCall(uint256 _sweep_amount) external onlyBalancer {
        uint256 missing_usdx = 0;
        (uint256 usdx_balance, uint256 sweep_balance) = _balances();

        if (call_delay > 0) call_time = block.timestamp + call_delay;

        call_amount = _min(_sweep_amount, sweep_borrowed);

        if (sweep_balance < call_amount) {
            uint256 missing_sweep = call_amount - sweep_balance;
            missing_usdx = SWEEP.convertToUSD(missing_sweep);
            if (missing_usdx > usdx_balance)
                _divest(missing_usdx - usdx_balance);
        }

        if (missing_usdx > 0) call_amount = _buy(missing_usdx, 0);
        if (call_amount > 0) _repay(call_amount);

        emit AutoCalled(_sweep_amount);
    }

    /**
     * @notice Cancel Call
     * @dev Cancels the auto call request by clearing variables for an asset 
     * that has a call_delay: meaning that it does not autorepay.
     */
    function cancelCall() external onlyAdmin {
        emit CallCancelled(call_amount);
        call_amount = 0;
        call_time = 0;
    }

    /**
     * @notice Auto Invest.
     * @param _sweep_amount to mint.
     */
    function autoInvest(uint256 _sweep_amount) external onlyBalancer {
        uint256 sweep_limit = SWEEP.minters(address(this)).max_amount;
        uint256 sweep_available = sweep_limit - sweep_borrowed;
        _sweep_amount = _min(_sweep_amount, sweep_available);
        int256 current_equity_ratio = _calculateEquityRatio(_sweep_amount, 0);

        if(!auto_invest) revert NotAutoInvest();
        if(_sweep_amount < auto_invest_min_amount) revert NotAutoInvesMinAMount();
        if(current_equity_ratio < auto_invest_min_ratio) revert NotAutoInvestMinRatio();

        _borrow(_sweep_amount);
        uint256 usdx_amount = _sell(_sweep_amount, 0);
        _invest(usdx_amount, 0);

        emit AutoInvested(_sweep_amount);
    }

    /**
     * @notice Buy
     * Buys sweep_amount from the stabilizer's balance to the AMM (swaps USDX to SWEEP).
     * @param _usdx_amount Amount to be changed in the AMM.
     * @param _amountOutMin Minimum amount out.
     * @dev Increases the sweep balance and decrease usdx balance.
     */
    function buySweepOnAMM(
        uint256 _usdx_amount,
        uint256 _amountOutMin
    ) external onlyBorrower whenNotPaused returns (uint256 sweep_amount) {
        sweep_amount = _buy(_usdx_amount, _amountOutMin);

        emit Bought(sweep_amount);
    }

    /**
     * @notice Sell Sweep
     * Sells sweep_amount from the stabilizer's balance to the AMM (swaps SWEEP to USDX).
     * @param _sweep_amount.
     * @param _amountOutMin Minimum amount out.
     * @dev Decreases the sweep balance and increase usdx balance
     */
    function sellSweepOnAMM(
        uint256 _sweep_amount,
        uint256 _amountOutMin
    ) external onlyBorrower whenNotPaused returns (uint256 usdx_amount) {
        usdx_amount = _sell(_sweep_amount, _amountOutMin);

        emit Sold(_sweep_amount);
    }

    /**
     * @notice Buy Sweep with Stabilizer
     * Buys sweep_amount from the stabilizer's balance to the Borrower (swaps USDX to SWEEP).
     * @param _usdx_amount.
     * @dev Decreases the sweep balance and increase usdx balance
     */
    function swapUsdxToSweep(
        uint256 _usdx_amount
    ) external onlyBorrower whenNotPaused validAmount(_usdx_amount) {
        uint256 sweep_amount = SWEEP.convertToSWEEP(_usdx_amount);
        (, uint256 sweep_balance) = _balances();
        if (sweep_amount > sweep_balance) revert NotEnoughBalance();

        TransferHelper.safeTransferFrom(
            address(usdx),
            msg.sender,
            address(this),
            _usdx_amount
        );
        TransferHelper.safeTransfer(address(SWEEP), msg.sender, sweep_amount);

        emit BoughtSWEEP(sweep_amount);
    }

    /**
     * @notice Sell Sweep with Stabilizer
     * Sells sweep_amount to the stabilizer (swaps SWEEP to USDX).
     * @param _sweep_amount.
     * @dev Decreases the sweep balance and increase usdx balance
     */
    function swapSweepToUsdx(
        uint256 _sweep_amount
    ) external onlyBorrower whenNotPaused validAmount(_sweep_amount) {
        uint256 usd_amount = SWEEP.convertToUSD(_sweep_amount);
        (uint256 usdx_balance, ) = _balances();
        uint256 usdx_amount = _USDtoUSDX(usd_amount);

        if (usdx_amount > usdx_balance) revert NotEnoughBalance();

        TransferHelper.safeTransferFrom(
            address(SWEEP),
            msg.sender,
            address(this),
            _sweep_amount
        );
        TransferHelper.safeTransfer(address(usdx), msg.sender, usdx_amount);

        emit SoldSWEEP(usdx_amount);
    }

    /**
     * @notice Withdraw SWEEP
     * Takes out sweep balance if the new equity ratio is higher than the minimum equity ratio.
     * @param _token.
     * @param _amount.
     * @dev Decreases the sweep balance.
     */
    function withdraw(
        address _token,
        uint256 _amount
    ) external onlyBorrower whenNotPaused validAmount(_amount) {
        if (_token != address(SWEEP) && _token != address(usdx))
            revert InvalidToken();

        if (_amount > IERC20Metadata(_token).balanceOf(address(this)))
            revert NotEnoughBalance();

        if (sweep_borrowed > 0) {
            uint256 usdx_amount = _amount;
            if (_token == address(SWEEP))
                usdx_amount = SWEEP.convertToUSD(_amount);
            int256 current_equity_ratio = _calculateEquityRatio(0, _USDXtoUSD(usdx_amount));
            if (current_equity_ratio < min_equity_ratio)
                revert EquityRatioExcessed();
        }

        TransferHelper.safeTransfer(_token, msg.sender, _amount);

        emit Withdrawn(_token, _amount);
    }

    /* ========== Internals ========== */

    /**
     * @notice Invest To Asset.
     */
    function _invest(
        uint256 _usdx_amount,
        uint256 _sweep_amount
    ) internal virtual {}

    /**
     * @notice Divest From Asset.
     */
    function _divest(uint256 _amount) internal virtual {}

    /**
     * @notice Liquidates
     * A liquidator repays the debt in sweep and gets the same value
     * of the assets that the stabilizer holds at a discount
     */
    function _liquidate(address token) internal {
        if (!isDefaulted()) revert NotDefaulted();

        uint256 sweep_to_liquidate = getLiquidationValue();
        (uint256 usdx_balance, uint256 sweep_balance) = _balances();
        uint256 token_balance = IERC20Metadata(token).balanceOf(address(this));
        // Gives all the assets to the liquidator first
        TransferHelper.safeTransfer(address(SWEEP), msg.sender, sweep_balance);
        TransferHelper.safeTransfer(address(usdx), msg.sender, usdx_balance);
        TransferHelper.safeTransfer(token, msg.sender, token_balance);

        // Takes SWEEP from the liquidator and repays as much debt as it can
        TransferHelper.safeTransferFrom(
            address(SWEEP),
            msg.sender,
            address(this),
            sweep_to_liquidate
        );

        _repay(sweep_to_liquidate);

        emit Liquidated(msg.sender);
    }

    function _buy(
        uint256 _usdx_amount,
        uint256 _amountOutMin
    ) internal returns (uint256) {
        (uint256 usdx_balance, ) = _balances();
        _usdx_amount = _min(_usdx_amount, usdx_balance);

        if (_usdx_amount == 0) revert NotEnoughBalance();

        TransferHelper.safeApprove(address(usdx), address(amm), _usdx_amount);
        uint256 sweep_amount = amm.buySweep(
            address(usdx),
            _usdx_amount,
            _amountOutMin
        );

        return sweep_amount;
    }

    function _sell(
        uint256 _sweep_amount,
        uint256 _amountOutMin
    ) internal returns (uint256) {
        (, uint256 sweep_balance) = _balances();
        _sweep_amount = _min(_sweep_amount, sweep_balance);

        if (_sweep_amount == 0) revert NotEnoughBalance();

        TransferHelper.safeApprove(address(SWEEP), address(amm), _sweep_amount);
        uint256 usdx_amount = amm.sellSweep(
            address(usdx),
            _sweep_amount,
            _amountOutMin
        );

        return usdx_amount;
    }

    function _borrow(uint256 _sweep_amount) internal {
        uint256 spread_amount = accruedFee();
        SWEEP.minter_mint(address(this), _sweep_amount);
        sweep_borrowed += _sweep_amount;
        spread_date = block.timestamp;

        if (spread_amount > 0) {
            TransferHelper.safeTransfer(
                address(SWEEP),
                SWEEP.treasury(),
                spread_amount
            );
            emit PayFee(spread_amount);
        }

        emit Borrowed(_sweep_amount);
    }

    function _repay(uint256 _sweep_amount) internal {
        (, uint256 sweep_balance) = _balances();
        _sweep_amount = _min(_sweep_amount, sweep_balance);

        if (_sweep_amount == 0) revert NotEnoughBalance();

        call_amount = (call_amount > _sweep_amount)
            ? call_amount - _sweep_amount
            : 0;

        if (call_delay > 0 && call_amount == 0) call_time = 0;

        uint256 spread_amount = accruedFee();
        spread_date = block.timestamp;

        uint256 sweep_amount = _sweep_amount - spread_amount;
        if (sweep_borrowed < sweep_amount) {
            sweep_amount = sweep_borrowed;
            sweep_borrowed = 0;
        } else {
            sweep_borrowed -= sweep_amount;
        }

        TransferHelper.safeTransfer(
            address(SWEEP),
            SWEEP.treasury(),
            spread_amount
        );

        TransferHelper.safeApprove(address(SWEEP), address(this), sweep_amount);
        SWEEP.minter_burn_from(sweep_amount);

        emit Repaid(sweep_amount);
    }

    /**
     * @notice Calculate Equity Ratio
     * Calculated the equity ratio based on the internal storage.
     * @param _sweep_delta Variation of SWEEP to recalculate the new equity ratio.
     * @param _usd_delta Variation of USD to recalculate the new equity ratio.
     * @return the new equity ratio used to control the Mint and Withdraw functions.
     * @dev Current Equity Ratio percentage has a precision of 4 decimals.
     */
    function _calculateEquityRatio(
        uint256 _sweep_delta,
        uint256 _usd_delta
    ) internal view returns (int256) {
        uint256 current_value = currentValue();
        uint256 sweep_delta_in_usd = SWEEP.convertToUSD(_sweep_delta);
        uint256 total_value = current_value + sweep_delta_in_usd - _usd_delta;

        if (total_value == 0) return 0;

        uint256 senior_tranche_in_usd = SWEEP.convertToUSD(
            sweep_borrowed + _sweep_delta
        );

        // 1e6 is decimals of the percentage result
        int256 current_equity_ratio = ((int256(total_value) -
            int256(senior_tranche_in_usd)) * 1e6) / int256(total_value);

        if (current_equity_ratio < -1e6) current_equity_ratio = -1e6;

        return current_equity_ratio;
    }

    /**
     * @notice Get Balances of the usdx and SWEEP.
     **/
    function _balances()
        internal
        view
        returns (uint256 usdx_balance, uint256 sweep_balance)
    {
        usdx_balance = usdx.balanceOf(address(this));
        sweep_balance = SWEEP.balanceOf(address(this));
    }

    /**
     * @notice Get minimum value between a and b.
     **/
    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a < b) ? a : b;
    }

    /**
     * @notice Calculate the amount USD that are equivalent to the USDX input.
     **/
    function _USDXtoUSD(uint256 _usdx_amount) internal view returns (uint256) {
        return 
        (
            (_usdx_amount * uint256(usd_oracle.getLatestPrice(USDC_FREQUENCY))) / 
            (10 ** (usd_oracle.getDecimals()))
        );
    }

    /**
     * @notice Calculate the amount USDX that are equivalent to the USD input.
     **/
    function _USDtoUSDX(uint256 _usdx_amount) internal view returns (uint256) {
        return 
        (
            (_usdx_amount * (10 ** (usd_oracle.getDecimals()))) / 
            uint256(usd_oracle.getLatestPrice(USDC_FREQUENCY))
        );
    }
}

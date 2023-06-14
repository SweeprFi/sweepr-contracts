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
import "../Common/Owned.sol";

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

contract Stabilizer is Owned, Pausable {
    using Math for uint256;
    
    // Variables
    string public name;
    address public borrower;
    int256 public minEquityRatio; // Minimum Equity Ratio. 10000 is 1%
    uint256 public sweepBorrowed;
    uint256 public loanLimit;

    uint256 public callTime;
    uint256 public callDelay; // 86400 is 1 day
    uint256 public callAmount;

    uint256 public spreadFee; // 10000 is 1%
    uint256 public spreadDate;
    uint256 public liquidatorDiscount; // 10000 is 1%
    string public link;

    int256 public autoInvestMinRatio; // 10000 is 1%
    uint256 public autoInvestMinAmount;
    bool public autoInvestEnabled;

    bool public settingsEnabled;

    // Tokens
    IERC20Metadata public usdx;

    // Constants for various precisions
    uint256 private constant DAY_SECONDS = 60 * 60 * 24; // seconds of Day
    uint256 private constant TIME_ONE_YEAR = 365 * DAY_SECONDS; // seconds of Year
    uint256 private constant PRECISION = 1e6;
    uint256 private constant ORACLE_FREQUENCY = 1 days;

    /* ========== Events ========== */

    event Borrowed(uint256 indexed sweepAmount);
    event Repaid(uint256 indexed sweepAmount);
    event Withdrawn(address indexed token, uint256 indexed amount);
    event PayFee(uint256 indexed sweepAmount);
    event Bought(uint256 indexed sweepAmount);
    event Sold(uint256 indexed sweepAmount);
    event BoughtSWEEP(uint256 indexed sweepAmount);
    event SoldSWEEP(uint256 indexed usdxAmount);
    event LoanLimitChanged(uint256 loanLimit);
    event Proposed(address indexed borrower);
    event Rejected(address indexed borrower);

    event Invested(uint256 indexed usdxAmount, uint256 indexed sweepAmount);
    event Divested(uint256 indexed usdxAmount, uint256 indexed sweepAmount);
    event Liquidated(address indexed user);

    event AutoCalled(uint256 indexed sweepAmount);
    event AutoInvested(uint256 indexed sweepAmount);
    event CallCancelled(uint256 indexed sweepAmount);

    event ConfigurationChanged(
        int256 indexed minEquityRatio,
        uint256 indexed spreadFee,
        uint256 loanLimit,
        uint256 liquidatorDiscount,
        uint256 callDelay,
        int256 autoInvestMinRatio,
        uint256 autoInvestMinAmount,
        bool autoInvestEnabled,
        string url
    );

    /* ========== Errors ========== */
    error NotBorrower();
    error NotBalancer();
    error SettingsDisabled();
    error OverZero();
    error InvalidMinter();
    error NotEnoughBalance();
    error EquityRatioExcessed();
    error InvalidToken();
    error SpreadNotEnough();
    error NotDefaulted();
    error ZeroPrice();
    error NotAutoInvest();
    error NotAutoInvestMinAmount();
    error NotAutoInvestMinRatio();

    /* ========== Modifies ========== */
    modifier onlyBorrower() {
        if (msg.sender != borrower) revert NotBorrower();
        _;
    }

    modifier onlyBalancer() {
        if (msg.sender != SWEEP.balancer()) revert NotBalancer();
        _;
    }

    modifier onlySettingsEnabled() {
        if (!settingsEnabled) revert SettingsDisabled();
        _;
    }

    modifier validAddress(address addr) {
        if (addr == address(0)) revert ZeroAddressDetected();
        _;
    }

    modifier validAmount(uint256 amount) {
        if (amount == 0) revert OverZero();
        _;
    }

    constructor(
        string memory assetName,
        address sweepAddress_,
        address usdxAddress,
        address borrowerAddress
    ) Owned(sweepAddress_) {
        if(borrowerAddress == address(0)) revert ZeroAddressDetected();
        name = assetName;
        usdx = IERC20Metadata(usdxAddress);
        borrower = borrowerAddress;
        settingsEnabled = true;
    }

    /* ========== Views ========== */

    /**
     * @notice Defaulted
     * @return bool that tells if stabilizer is in default.
     */
    function isDefaulted() public view returns (bool) {
        return
            (callDelay > 0 && callAmount > 0 && block.timestamp > callTime) ||
            (sweepBorrowed > 0 && getEquityRatio() < minEquityRatio);
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
        if (sweepBorrowed > 0) {
            uint256 period = block.timestamp - spreadDate;
            return
                (sweepBorrowed * spreadFee * period) /
                (TIME_ONE_YEAR * PRECISION);
        }

        return 0;
    }

    /**
     * @notice Get Debt Amount
     * debt = borrow_amount + spread fee
     * @return uint256 calculated debt amount.
     */
    function getDebt() external view returns (uint256) {
        return sweepBorrowed + accruedFee();
    }

    /**
     * @notice Get Current Value
     * value = sweep balance + usdx balance
     * @return uint256.
     */
    function currentValue() public view virtual returns (uint256) {
        (uint256 usdxBalance, uint256 sweepBalance) = _balances();
        uint256 sweepBalanceInUSD = SWEEP.convertToUSD(sweepBalance);

        return (amm().tokenToUSD(usdxBalance) + sweepBalanceInUSD);
    }

    /**
     * @notice Get AMM from Sweep
     * @return address.
     */
    function amm() public view virtual returns (IAMM) {
        return IAMM(ISweep(sweepAddress).amm());
    }

    /**
     * @notice Get Junior Tranche Value
     * @return int256 calculated junior tranche amount.
     */
    function getJuniorTrancheValue() external view returns (int256) {
        uint256 seniorTrancheInUSD = SWEEP.convertToUSD(sweepBorrowed);
        uint256 totalValue = currentValue();

        return int256(totalValue) - int256(seniorTrancheInUSD);
    }

    /**
     * @notice Returns the SWEEP required to liquidate the stabilizer
     * @return uint256
     */
    function getLiquidationValue() public view returns (uint256) {
        return
            accruedFee() + SWEEP.convertToSWEEP(
                (currentValue() * (1e6 - liquidatorDiscount)) / PRECISION
            );
    }

    /* ========== Settings ========== */
    /**
     * @notice Pause
     * @dev Stops investment actions.
     */
    function pause() external onlyMultisig {
        _pause();
    }

    function unpause() external onlyMultisig {
        _unpause();
    }

    /**
     * @notice Configure intial settings
     * @param min_equity_ratio The minimum equity ratio can be negative.
     * @param spread_fee The fee that the protocol will get for providing the loan when the stabilizer takes debt
     * @param loan_limit How much debt a Stabilizer can take in SWEEP.
     * @param liquidator_discount A percentage that will be discounted in favor to the liquidator when the stabilizer is liquidated
     * @param call_delay Time in seconds after AutoCall until the Stabilizer gets defaulted if the debt is not paid in that period
     * @param auto_invest_min_ratio Minimum equity ratio that should be kept to allow the execution of an auto invest
     * @param auto_invest_min_amount Minimum amount to be invested to allow the execution of an auto invest
     * @param auto_invest_enable Represents if an auto invest execution is allowed or not
     * @param url A URL link to a Web page that describes the borrower and the asset
     * @dev Sets the initial configuration of the Stabilizer.
     * This configuration will be analyzed by the protocol and if accepted,
     * used to include the Stabilizer in the minter's whitelist of Sweep.
     */
    function configure(
        int256 min_equity_ratio,
        uint256 spread_fee,
        uint256 loan_limit,
        uint256 liquidator_discount,
        uint256 call_delay,
        int256 auto_invest_min_ratio,
        uint256 auto_invest_min_amount,
        bool auto_invest_enable,
        string calldata url
    ) external onlyBorrower onlySettingsEnabled {
        minEquityRatio = min_equity_ratio;
        spreadFee = spread_fee;
        loanLimit = loan_limit;
        liquidatorDiscount = liquidator_discount;
        callDelay = call_delay;
        autoInvestMinRatio = auto_invest_min_ratio;
        autoInvestMinAmount = auto_invest_min_amount;
        autoInvestEnabled = auto_invest_enable;
        link = url;

        emit ConfigurationChanged(
            min_equity_ratio,
            spread_fee,
            loan_limit,
            liquidator_discount,
            call_delay,
            auto_invest_min_ratio,
            auto_invest_min_amount,
            auto_invest_enable,
            url
        );
    }

    /**
     * @notice Changes the account that control the global configuration to the protocol/governance admin
     * @dev after disable settings by admin
     * the protocol will evaluate adding the stabilizer to the minter list.
     */
    function propose() external onlyBorrower {
        settingsEnabled = false;

        emit Proposed(borrower);
    }

    /**
     * @notice Changes the account that control the global configuration to the borrower
     * @dev after enable settings for the borrower
     * he/she should edit the values to align to the protocol requirements
     */
    function reject() external onlyGov {
        settingsEnabled = true;

        emit Rejected(borrower);
    }

    /* ========== Actions ========== */

    /**
     * @notice Borrows Sweep
     * Asks the stabilizer to mint a certain amount of sweep token.
     * @param sweepAmount.
     * @dev Increases the sweepBorrowed (senior tranche).
     */
    function borrow(
        uint256 sweepAmount
    ) external onlyBorrower whenNotPaused validAmount(sweepAmount) {
        if (!SWEEP.isValidMinter(address(this))) revert InvalidMinter();

        uint256 sweepAvailable = loanLimit - sweepBorrowed;
        if (sweepAvailable < sweepAmount) revert NotEnoughBalance();

        int256 currentEquityRatio = _calculateEquityRatio(sweepAmount, 0);
        if (currentEquityRatio < minEquityRatio)
            revert EquityRatioExcessed();

        _borrow(sweepAmount);
    }

    /**
     * @notice Repays Sweep
     * Burns the sweep_amount to reduce the debt (senior tranche).
     * @param sweepAmount Amount to be burnt by Sweep.
     * @dev Decreases the sweep borrowed.
     */
    function repay(uint256 sweepAmount) external onlyBorrower {
        _repay(sweepAmount);
    }

    /**
     * @notice Pay the spread to the treasury
     */
    function payFee() external onlyBorrower {
        uint256 spreadAmount = accruedFee();
        spreadDate = block.timestamp;

        uint256 sweepBalance = SWEEP.balanceOf(address(this));

        if (spreadAmount > sweepBalance) revert SpreadNotEnough();

        if (spreadAmount > 0) {
            TransferHelper.safeTransfer(
                sweepAddress,
                SWEEP.treasury(),
                spreadAmount
            );

            emit PayFee(spreadAmount);
        }
    }

    /**
     * @notice Set Loan Limit.
     * @param newLoanLimit.
     * @dev How much debt an Stabilizer can take in SWEEP.
     */
    function setLoanLimit(uint256 newLoanLimit) external onlyBalancer {
        loanLimit = newLoanLimit;

        emit LoanLimitChanged(newLoanLimit);
    }

    /**
     * @notice Auto Call.
     * @param sweep_amount to repay.
     * @dev Strategy:
     * 1) repays debt with SWEEP balance
     * 2) repays remaining debt by divesting
     * 3) repays remaining debt by buying on SWEEP in the AMM
     */
    function autoCall(uint256 sweep_amount, uint256 price, uint256 slippage) external onlyBalancer {
        (uint256 usdxBalance, uint256 sweepBalance) = _balances();
        uint256 repayAmount = sweep_amount.min(sweepBorrowed);

        if (callDelay > 0) {
            callTime = block.timestamp + callDelay;
            callAmount = repayAmount;
        }

        if (sweepBalance < repayAmount) {
            uint256 missingSweep = repayAmount - sweepBalance;
            uint256 missingUsdx = amm().USDtoToken(SWEEP.convertToUSD(missingSweep));

            if (missingUsdx > usdxBalance) {
                _divest(missingUsdx - usdxBalance);
            }

            if (usdx.balanceOf(address(this)) > 0) {
                uint256 missingUsd = amm().tokenToUSD(missingUsdx);
                uint256 sweepAmount = missingUsd.mulDiv(10 ** SWEEP.decimals(), price);
                uint256 minAmountOut = sweepAmount * (PRECISION - slippage) / PRECISION;
                _buy(missingUsdx, minAmountOut);
            }
        }

        if (SWEEP.balanceOf(address(this)) > 0 && repayAmount > 0 ) {
            _repay(repayAmount);
        }

        emit AutoCalled(sweep_amount);
    }

    /**
     * @notice Cancel Call
     * @dev Cancels the auto call request by clearing variables for an asset 
     * that has a callDelay: meaning that it does not autorepay.
     */
    function cancelCall() external onlyBalancer {
        emit CallCancelled(callAmount);
        callAmount = 0;
        callTime = 0;
    }

    /**
     * @notice Auto Invest.
     * @param sweepAmount to mint.
     * @param price.
     * @param slippage.
     */
    function autoInvest(uint256 sweepAmount, uint256 price, uint256 slippage) external onlyBalancer {
        uint256 sweepLimit = SWEEP.minters(address(this)).maxAmount;
        uint256 sweepAvailable = sweepLimit - sweepBorrowed;
        sweepAmount = sweepAmount.min(sweepAvailable);
        int256 currentEquityRatio = _calculateEquityRatio(sweepAmount, 0);
        
        if(!autoInvestEnabled) revert NotAutoInvest();
        if(sweepAmount < autoInvestMinAmount) revert NotAutoInvestMinAmount();
        if(currentEquityRatio < autoInvestMinRatio) revert NotAutoInvestMinRatio();

        _borrow(sweepAmount);

        uint256 usdAmount = sweepAmount.mulDiv(price, 10 ** SWEEP.decimals());
        uint256 minAmountOut = amm().USDtoToken(usdAmount) * (PRECISION - slippage) / PRECISION;
        uint256 usdxAmount = _sell(sweepAmount, minAmountOut);

        _invest(usdxAmount, 0);

        emit AutoInvested(sweepAmount);
    }

    /**
     * @notice Buy
     * Buys sweep_amount from the stabilizer's balance to the AMM (swaps USDX to SWEEP).
     * @param usdxAmount Amount to be changed in the AMM.
     * @param amountOutMin Minimum amount out.
     * @dev Increases the sweep balance and decrease usdx balance.
     */
    function buySweepOnAMM(
        uint256 usdxAmount,
        uint256 amountOutMin
    ) external onlyBorrower whenNotPaused returns (uint256 sweepAmount) {
        sweepAmount = _buy(usdxAmount, amountOutMin);

        emit Bought(sweepAmount);
    }

    /**
     * @notice Sell Sweep
     * Sells sweep amount from the stabilizer's balance to the AMM (swaps SWEEP to USDX).
     * @param sweepAmount.
     * @param amountOutMin Minimum amount out.
     * @dev Decreases the sweep balance and increase usdx balance
     */
    function sellSweepOnAMM(
        uint256 sweepAmount,
        uint256 amountOutMin
    ) external onlyBorrower whenNotPaused returns (uint256 usdxAmount) {
        usdxAmount = _sell(sweepAmount, amountOutMin);

        emit Sold(sweepAmount);
    }

    /**
     * @notice Buy Sweep with Stabilizer
     * Buys sweep_amount from the stabilizer's balance to the Borrower (swaps USDX to SWEEP).
     * @param usdxAmount.
     * @dev Decreases the sweep balance and increase usdx balance
     */
    function swapUsdxToSweep(
        uint256 usdxAmount
    ) external onlyBorrower whenNotPaused validAmount(usdxAmount) {
        uint256 sweepAmount = SWEEP.convertToSWEEP(amm().tokenToUSD(usdxAmount));
        uint256 sweepBalance = SWEEP.balanceOf(address(this));
        if (sweepAmount > sweepBalance) revert NotEnoughBalance();

        TransferHelper.safeTransferFrom(
            address(usdx),
            msg.sender,
            address(this),
            usdxAmount
        );
        TransferHelper.safeTransfer(sweepAddress, msg.sender, sweepAmount);

        emit BoughtSWEEP(sweepAmount);
    }

    /**
     * @notice Sell Sweep with Stabilizer
     * Sells sweep_amount to the stabilizer (swaps SWEEP to USDX).
     * @param sweepAmount.
     * @dev Decreases the sweep balance and increase usdx balance
     */
    function swapSweepToUsdx(
        uint256 sweepAmount
    ) external onlyBorrower whenNotPaused validAmount(sweepAmount) {
        uint256 usdxAmount = amm().USDtoToken(SWEEP.convertToUSD(sweepAmount));
        uint256 usdxBalance = usdx.balanceOf(address(this));

        if (usdxAmount > usdxBalance) revert NotEnoughBalance();

        TransferHelper.safeTransferFrom(
            sweepAddress,
            msg.sender,
            address(this),
            sweepAmount
        );
        TransferHelper.safeTransfer(address(usdx), msg.sender, usdxAmount);

        emit SoldSWEEP(usdxAmount);
    }

    /**
     * @notice Withdraw SWEEP
     * Takes out sweep balance if the new equity ratio is higher than the minimum equity ratio.
     * @param token.
     * @param amount.
     * @dev Decreases the sweep balance.
     */
    function withdraw(
        address token,
        uint256 amount
    ) external onlyBorrower whenNotPaused validAmount(amount) {
        if (token != sweepAddress && token != address(usdx))
            revert InvalidToken();

        if (amount > IERC20Metadata(token).balanceOf(address(this)))
            revert NotEnoughBalance();

        if (sweepBorrowed > 0) {
            uint256 usdAmount = token == sweepAddress ?
                SWEEP.convertToUSD(amount) : amm().tokenToUSD(amount);
            int256 currentEquityRatio = _calculateEquityRatio(0, usdAmount);
            if (currentEquityRatio < minEquityRatio)
                revert EquityRatioExcessed();
        }

        TransferHelper.safeTransfer(token, msg.sender, amount);

        emit Withdrawn(token, amount);
    }

    /* ========== Internals ========== */

    /**
     * @notice Invest To Asset.
     */
    function _invest(
        uint256 usdxAmount,
        uint256 sweepAmount
    ) internal virtual {}

    /**
     * @notice Divest From Asset.
     */
    function _divest(uint256 amount) internal virtual {}

    /**
     * @notice Liquidates
     * A liquidator repays the debt in sweep and gets the same value
     * of the assets that the stabilizer holds at a discount
     */
    function _liquidate(address token) internal {
        if (!isDefaulted()) revert NotDefaulted();
        address self = address(this);

        uint256 sweepToLiquidate = getLiquidationValue();
        (uint256 usdxBalance, uint256 sweepBalance) = _balances();
        uint256 tokenBalance = IERC20Metadata(token).balanceOf(self);
        // Gives all the assets to the liquidator first
        TransferHelper.safeTransfer(sweepAddress, msg.sender, sweepBalance);
        TransferHelper.safeTransfer(address(usdx), msg.sender, usdxBalance);
        TransferHelper.safeTransfer(token, msg.sender, tokenBalance);

        // Takes SWEEP from the liquidator and repays as much debt as it can
        TransferHelper.safeTransferFrom(
            sweepAddress,
            msg.sender,
            self,
            sweepToLiquidate
        );

        _repay(sweepToLiquidate);

        emit Liquidated(msg.sender);
    }

    function _buy(
        uint256 usdxAmount,
        uint256 amountOutMin
    ) internal returns (uint256) {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        usdxAmount = usdxAmount.min(usdxBalance);

        if (usdxAmount == 0) revert NotEnoughBalance();

        TransferHelper.safeApprove(address(usdx), SWEEP.amm(), usdxAmount);
        uint256 sweepAmount = amm().buySweep(
            address(usdx),
            usdxAmount,
            amountOutMin
        );

        return sweepAmount;
    }

    function _sell(
        uint256 sweepAmount,
        uint256 amountOutMin
    ) internal returns (uint256) {
        uint256 sweepBalance = SWEEP.balanceOf(address(this));
        sweepAmount = sweepAmount.min(sweepBalance);

        if (sweepAmount == 0) revert NotEnoughBalance();

        TransferHelper.safeApprove(sweepAddress, SWEEP.amm(), sweepAmount);
        uint256 usdxAmount = amm().sellSweep(
            address(usdx),
            sweepAmount,
            amountOutMin
        );

        return usdxAmount;
    }

    function _borrow(uint256 sweepAmount) internal {
        uint256 spreadAmount = accruedFee();
        SWEEP.minterMint(address(this), sweepAmount);
        sweepBorrowed += sweepAmount;
        spreadDate = block.timestamp;

        if (spreadAmount > 0) {
            TransferHelper.safeTransfer(
                sweepAddress,
                SWEEP.treasury(),
                spreadAmount
            );
            emit PayFee(spreadAmount);
        }

        emit Borrowed(sweepAmount);
    }

    function _repay(uint256 sweepAmount) internal {
        uint256 sweepBalance = SWEEP.balanceOf(address(this));
        sweepAmount = sweepAmount.min(sweepBalance);

        if (sweepAmount == 0) revert NotEnoughBalance();

        callAmount = (callAmount > sweepAmount)
            ? (callAmount - sweepAmount) : 0;

        if (callDelay > 0 && callAmount == 0) callTime = 0;

        uint256 spreadAmount = accruedFee();
        spreadDate = block.timestamp;

        uint256 sweep_amount = sweepAmount - spreadAmount;
        if (sweepBorrowed < sweep_amount) {
            sweep_amount = sweepBorrowed;
            sweepBorrowed = 0;
        } else {
            sweepBorrowed -= sweep_amount;
        }

        TransferHelper.safeTransfer(
            sweepAddress,
            SWEEP.treasury(),
            spreadAmount
        );

        TransferHelper.safeApprove(sweepAddress, address(this), sweep_amount);
        SWEEP.minterBurnFrom(sweep_amount);

        emit Repaid(sweep_amount);
    }

    /**
     * @notice Calculate Equity Ratio
     * Calculated the equity ratio based on the internal storage.
     * @param sweepDelta Variation of SWEEP to recalculate the new equity ratio.
     * @param usdDelta Variation of USD to recalculate the new equity ratio.
     * @return the new equity ratio used to control the Mint and Withdraw functions.
     * @dev Current Equity Ratio percentage has a precision of 4 decimals.
     */
    function _calculateEquityRatio(
        uint256 sweepDelta,
        uint256 usdDelta
    ) internal view returns (int256) {
        uint256 currentValue_ = currentValue();
        uint256 sweepDeltaInUsd = SWEEP.convertToUSD(sweepDelta);
        uint256 totalValue = currentValue_ + sweepDeltaInUsd - usdDelta;

        if (totalValue == 0) return 0;

        uint256 seniorTrancheInUsd = SWEEP.convertToUSD(
            sweepBorrowed + sweepDelta
        );

        // 1e6 is decimals of the percentage result
        int256 currentEquityRatio = ((int256(totalValue) -
            int256(seniorTrancheInUsd)) * 1e6) / int256(totalValue);

        if (currentEquityRatio < -1e6) currentEquityRatio = -1e6;

        return currentEquityRatio;
    }

    /**
     * @notice Get Balances of the usdx and SWEEP.
     **/
    function _balances()
        internal
        view
        returns (uint256 usdxBalance, uint256 sweepBalance)
    {
        usdxBalance = usdx.balanceOf(address(this));
        sweepBalance = SWEEP.balanceOf(address(this));
    }

}

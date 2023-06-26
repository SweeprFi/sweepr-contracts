// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ======================== Balancer.sol ==============================
// ====================================================================

/**
 * @title Balancer
 * @dev Implementation:
 * Updates the interest rate from Sweep periodically.
 * Executes the auto calls and auto invests in Stabilizers.
 */

import "../Common/Owned.sol";
import "../Stabilizer/IStabilizer.sol";
import { SD59x18, wrap, unwrap } from "@prb/math/src/SD59x18.sol";

contract Balancer is Owned {
    enum Mode { IDLE, INVEST, CALL }

    uint256 public index;
    uint256 private constant ONE_YEAR = 365 * 1 days;
    uint256 private constant PRECISION = 1e6;    
    
    mapping(uint256 => address) public stabilizers;
    mapping(address => uint256) public amounts;

    // Events
    event InterestRateRefreshed(int256 interestRate);
    event ActionAdded(address stabilizer, uint256 amount);
    event ActionRemoved(address stabilizer);
    event Execute(Mode mode);
    event Reset();

    error ModeMismatch(Mode intention, Mode state);
    error WrongDataLength();

    constructor(address sweepAddress_) Owned(sweepAddress_) {}

    /**
     * @notice refresh interest rate periodically.
     * returns mode: 0 => idle, 1 => invest, 2 => call
     */
    function refreshInterestRate() public onlyMultisig returns (Mode mode) {
        int256 interestRate = sweep.interestRate();
        int256 stepValue = sweep.stepValue();
        uint256 targetPrice = sweep.targetPrice();
        
        mode = getMode();

        if (mode == Mode.CALL) interestRate += stepValue;
        if (mode == Mode.INVEST) interestRate -= stepValue;

        uint256 nextTargetPrice = getNextTargetPrice(
            targetPrice,
            interestRate
        );

        sweep.startNewPeriod();
        sweep.setInterestRate(interestRate);
        sweep.setTargetPrice(targetPrice, nextTargetPrice);

        emit InterestRateRefreshed(interestRate);
    }

    function getMode() public view returns (Mode) {
        uint256 twaPrice = sweep.twaPrice();
        uint256 targetPrice = sweep.targetPrice();
        uint256 spread = sweep.arbSpread() * targetPrice / PRECISION;
        uint256 upperBound = targetPrice + spread;
        uint256 lowerBound = targetPrice - spread;

        if (twaPrice < lowerBound) return Mode.CALL;
        if (twaPrice > upperBound) return Mode.INVEST;
        return Mode.IDLE;
    }

    /* get next target price with the following formula:
        next_price = p * (1 + r) ^ (t / y)
        * r: interest rate per year
        * t: time period to pay the rate
        * y: time in one year
        * p: current price
    */
    function getNextTargetPrice(
        uint256 targetPrice,
        int256 interestRate
    ) internal view returns (uint256) {
        SD59x18 precision = wrap(int256(PRECISION));
        SD59x18 year = wrap(int256(ONE_YEAR));
        SD59x18 period = wrap(int256(sweep.periodTime()));
        SD59x18 timeRatio = period.div(year);
        SD59x18 priceRatio = precision.add(wrap(interestRate));

        int256 priceUnit = unwrap(priceRatio.pow(timeRatio).div(
            precision.pow(timeRatio)
        ));

        return targetPrice * uint256(priceUnit) / (10 ** sweep.decimals());
    }

    /**
     * @notice Set Interest Rate
     * @dev Assigns the value that will be set as the interest rate
     * @param interestRate new value to be assigned.
     */
    function setInterestRate(int256 interestRate) external onlyMultisig {
        sweep.setInterestRate(interestRate);
    }

    /**
     * @notice Set Loan Limit
     * @dev Assigns a new loan limit to a stabilizer.
     * @param stabilizer to assign the new loan limit to.
     * @param loanLimit new value to be assigned.
     */
    function setLoanLimit(address stabilizer, uint256 loanLimit) external onlyMultisig {
        IStabilizer(stabilizer).setLoanLimit(loanLimit);
    }

    /**
     * @notice Cancel Call
     * @dev Cancels a call in an off chain stabilizer that is in the line to defaulted if it doesn't repay on time
     * @param stabilizer (offchain) to cancel the call
     */
    function cancelCall(address stabilizer) external onlyMultisig {
        IStabilizer(stabilizer).cancelCall();
    }

    /**
     * @notice Add Actions
     * @dev Adds a new amounts to be called/invested when executing
     * @param addresess to be added.
     * @param amounts_ to be called or invested,
     */
    function addActions(
        address[] calldata addresess,
        uint256[] calldata amounts_
    ) external onlyMultisig {
        uint256 len = addresess.length;
        if (len != amounts_.length)
            revert WrongDataLength();

        for (uint256 i = 0; i < len;) {
            addAction(addresess[i], amounts_[i]);
            unchecked { ++i; }
        }
    }

    /**
     * @notice Add Action
     * @dev Adds a new (stabilizer, amount) to be processed in the execute function
     * @param stabilizer stabilizer address,
     * @param amount amount to be called or invested,
     */
    function addAction(
        address stabilizer,
        uint256 amount
    ) public onlyMultisig {
        stabilizers[index++] = stabilizer;
        amounts[stabilizer] = amount;

        emit ActionAdded(stabilizer, amount);
    }

    /**
     * @notice Remove Action
     * @dev removes amount for the stabilizer
     * @param stabilizer stabilizer to be cleared
     */
    function removeAction(address stabilizer) external onlyMultisig {
        delete amounts[stabilizer];

        emit ActionRemoved(stabilizer);
    }

    /**
     * @notice Execute
     * @dev refreshes the interest rate, sets new loan limits and auto-calls or auto-invests a list of stabilizers
     * @param intention 0 => idle, 1 => invests, 2 => calls
     * @param force the execution if the state does not corresponds to the intention
     */
    function execute(
        Mode intention,
        bool force,
        uint256 price,
        uint256 slippage
    ) external onlyMultisig {
        emit Execute(intention);

        Mode state = refreshInterestRate();
        if (intention == Mode.IDLE) return;

        if (intention != state && !force)
            revert ModeMismatch(intention, state);

        for (uint256 i = 0; i < index;) {
            IStabilizer stabilizer = IStabilizer(stabilizers[i]);
            uint256 amount = amounts[stabilizers[i]];

            if (amount > 0) {
                if (intention == Mode.INVEST) {
                    stabilizer.setLoanLimit(stabilizer.loanLimit() + amount);
                    stabilizer.autoInvest(amount, price, slippage);
                } else {
                    // intention is CALL
                    stabilizer.autoCall(amount, price, slippage);
                    stabilizer.setLoanLimit(stabilizer.loanLimit() - amount);
                }
            }

            delete amounts[stabilizers[i]];
            delete stabilizers[i];

            unchecked { ++i; }
        }

        index = 0;
    }

    /**
     * @notice Reset
     * @dev Removes all the pending actions
     */
    function reset() public onlyMultisig {
        for (uint256 i = 0; i < index;) {
            delete amounts[stabilizers[i]];
            delete stabilizers[i];
            unchecked { ++i; }
        }

        index = 0;

        emit Reset();
    }

}

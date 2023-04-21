// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;
pragma experimental ABIEncoderV2;

// ====================================================================
// ======================== Balancer.sol ==============================
// ====================================================================

/**
 * @title Balancer
 * @dev Implementation:
 * Updates the interest rate from Sweep weekly.
 * Executes the repayments and auto invests from Stabilizers.
 */

import "../Stabilizer/IStabilizer.sol";
import "../Utils/Math/PRBMathSD59x18.sol";
import "../Utils/Uniswap/V3/libraries/TransferHelper.sol";
import "../Common/Owned.sol";
import "../Common/ERC20/IERC20.sol";

contract Balancer is Owned {
    using PRBMathSD59x18 for int256;

    // Constants
    uint256 private constant DAY_TIMESTAMP = 24 * 60 * 60;
    int256 private constant PRICE_PRECISION = 1e6;
    uint256 private constant PRECISE_PRICE_PRECISION = 1e18;
    uint256 private constant TIME_ONE_YEAR = 365 * 24 * 60 * 60;

    IERC20 public USDX;

    // Events
    event InterestRateRefreshed(int256 interestRate);

    constructor(
        address _sweep_address,
        address _usdc_address
    ) Owned(_sweep_address) {
        USDX = IERC20(_usdc_address);
    }

    /**
     * @notice refresh interest rate weekly.
     */
    function refreshInterestRate() public onlyAdmin {
        int256 interest_rate = SWEEP.interest_rate();
        uint256 amm_price = SWEEP.amm_price();
        uint256 current_target_price = SWEEP.target_price();
        uint256 period_time = SWEEP.period_time();
        int256 step_value = SWEEP.step_value();

        if (amm_price > current_target_price) {
            interest_rate -= step_value;
        } else {
            interest_rate += step_value;
        }

        uint256 next_target_price = getNextTargetPrice(
            current_target_price,
            interest_rate,
            period_time
        );

        SWEEP.startNewPeriod();
        SWEEP.setInterestRate(interest_rate);
        SWEEP.setTargetPrice(current_target_price, next_target_price);

        emit InterestRateRefreshed(interest_rate);
    }

    /* get next target price with the following formula:
        next_price = p * (1 + r) ^ (t / y)
        * r: interest rate per year
        * t: time period to pay the rate
        * y: time in one year
        * p: current price
    */
    function getNextTargetPrice(
        uint256 _current_target_price,
        int256 _interest_rate,
        uint256 _period_time
    ) internal pure returns (uint256) {
        int256 year = int256(TIME_ONE_YEAR).fromInt();
        int256 period = int256(_period_time).fromInt();
        int256 time_ratio = period.div(year);
        int256 price_ratio = PRICE_PRECISION + _interest_rate;
        int256 price_unit = price_ratio.pow(time_ratio).div(
            PRICE_PRECISION.pow(time_ratio)
        );

        return
            (_current_target_price * uint256(price_unit)) /
            PRECISE_PRICE_PRECISION;
    }

    /**
     * @notice Repayment Calls
     * @dev Makes a repayment call to a list of Assets provided as input.
     * @param _targets Assets to be called.
     * @param _amounts Amounts per Asset.
     */
    function repaymentCalls(
        address[] memory _targets,
        uint256[] memory _amounts
    ) external onlyAdmin {
        require(_targets.length == _amounts.length, "Wrong data received");
        uint256 len = _targets.length;

        for (uint256 index = 0; index < len; ) {
            if (_amounts[index] > 0) {
                IStabilizer(_targets[index]).repaymentCall(_amounts[index]);
            }
            unchecked {
                ++index;
            }
        }
    }

    /**
     * @notice Auto Invests
     * @dev Automates the investment process in a list of Assets provided as input.
     * @param _targets Assets to be invested.
     * @param _amounts Amounts per Asset.
     */
    function autoInvests(
        address[] memory _targets,
        uint256[] memory _amounts
    ) external onlyAdmin {
        require(_targets.length == _amounts.length, "Wrong data received");
        uint256 len = _targets.length;

        for (uint256 index = 0; index < len; ) {
            uint256 amount = _amounts[index];
            if (amount > 0) {
                address stabilizer = _targets[index];
                bool isValid = SWEEP.isValidMinter(stabilizer);
                bool isInvest = IStabilizer(stabilizer).auto_invest();
                if (isValid && isInvest) {
                    uint256 sweep_limit = SWEEP.minters(stabilizer).max_amount;
                    uint256 min_amount = IStabilizer(stabilizer)
                        .auto_invest_min_amount();
                    uint256 sweep_borrowed = IStabilizer(stabilizer)
                        .sweep_borrowed();
                    uint256 sweep_available = sweep_limit - sweep_borrowed;
                    amount = amount > sweep_available
                        ? sweep_available
                        : amount;
                    if (amount > min_amount)
                        IStabilizer(stabilizer).autoInvest(amount);
                }
            }
            unchecked {
                ++index;
            }
        }
    }
}

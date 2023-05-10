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
 * Executes the auto calls and auto invests from Stabilizers.
 */

import "../Stabilizer/IStabilizer.sol";
import "../Utils/Math/PRBMathSD59x18.sol";
import "../Utils/Uniswap/V3/libraries/TransferHelper.sol";
import "../Common/Owned.sol";
import "../Common/ERC20/IERC20.sol";

contract Balancer is Owned {
    using PRBMathSD59x18 for int256;

    struct Limit {
        uint248 amount;
        bool added;
        bool auto_invest;
    }

    // Slot 0
    uint24 private constant PRICE_PRECISION = 1e6;
    uint32 private constant ONE_YEAR = 365 * 1 days;
    int24 next_interest_rate;
    address hot_wallet;

    // Slot 1
    IERC20 public USDX;

    mapping(address => Limit) public limits;
    address[] public stabilizers;

    // Events
    event InterestRateRefreshed(int256 interestRate);
    event NextInterestRateSet(int24 next_interest_rate);
    event LimitAdded(address stabilizer, uint256 amount);
    event LimitRemoved(address stabilizer);
    event LimitsRemoved();
    event HotWalletChanged(address hot_wallet);
    event BalancerExecuted();

    error ZeroAmount();
    error ZeroAddress();
    error OnlyHotWallet();
    error InvalidMinter();

    modifier onlyHotWallet {
        if(msg.sender != hot_wallet) revert OnlyHotWallet();
        _;
    }

    constructor(
        address _sweep_address,
        address _usdc_address,
        address _hot_wallet
    ) Owned(_sweep_address) {
        hot_wallet = _hot_wallet;
        USDX = IERC20(_usdc_address);
    }

    /**
     * @notice refresh interest rate weekly.
     */
    function refreshInterestRate() public onlyAdmin {
        int256 interest_rate = SWEEP.interest_rate();
        uint256 current_target_price = SWEEP.target_price();
        uint256 twa_price = SWEEP.twa_price();
        uint256 arb_spread = SWEEP.arb_spread();
        
        uint256 arb_price_upper = ((PRICE_PRECISION + arb_spread) * SWEEP.target_price()) / PRICE_PRECISION;
        uint256 arb_price_lower = ((PRICE_PRECISION - arb_spread) * SWEEP.target_price()) / PRICE_PRECISION;

        uint256 period_time = SWEEP.period_time();
        int256 step_value = SWEEP.step_value();

        if (twa_price < arb_price_lower) {
           interest_rate += step_value;
        }

        if (twa_price > arb_price_upper) {
            interest_rate -= step_value;
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
    ) internal view returns (uint256) {
        int256 precision = int24(PRICE_PRECISION);
        int256 year = int256(int32(ONE_YEAR)).fromInt();
        int256 period = int256(_period_time).fromInt();
        int256 time_ratio = period.div(year);
        int256 price_ratio = precision + _interest_rate;
        int256 price_unit = price_ratio.pow(time_ratio).div(
            precision.pow(time_ratio)
        );

        return ((_current_target_price * uint256(price_unit)) / (10 ** SWEEP.decimals()));
    }

    /**
     * @notice Set Next Interest Rate
     * @dev Assigns the value that will be set as the interest rate when calling execute
     * @param _next_interest_rate new value to be assigned.
     */
    function setNextInterestRate(int24 _next_interest_rate) external onlyHotWallet {
        next_interest_rate = _next_interest_rate;
        emit NextInterestRateSet(next_interest_rate);
    }

    /**
     * @notice Add Loan Limits
     * @dev Adds a new loan limits per values sent in the array
     * @param _stabilizers stabilizer addresses to be added,
     * * @param _amounts new loan limit amounts for each stabilizer,
     */
    function addLoanLimits(
        address[] memory _stabilizers,
        uint96[] memory _amounts,
        bool[] memory _auto_invests
    ) external onlyHotWallet {
        require(_stabilizers.length == _amounts.length, "Wrong data received");
        require(_stabilizers.length == _auto_invests.length, "Wrong data received");

        for (uint256 i = 0; i < _stabilizers.length;) {
            addLoanLimit(_stabilizers[i], _amounts[i], _auto_invests[i]);
            unchecked { ++i; }
        }
    }

    /**
     * @notice Add Loan Limit
     * @dev Adds a new loan limit to the limits map and stabilizers array, to be processed in the execute call
     * @param _stabilizer stabilizer address,
     * * @param _amount new loan limit amount,
     */
    function addLoanLimit(address _stabilizer, uint96 _amount, bool _auto_invest) public onlyHotWallet {
        if(!SWEEP.isValidMinter(_stabilizer)) revert InvalidMinter();

        if(!limits[_stabilizer].added) {
            stabilizers.push(_stabilizer);
        }

        limits[_stabilizer] = Limit({ amount: _amount, added: true, auto_invest: _auto_invest});

        emit LimitAdded(_stabilizer, _amount);
    }

    /**
     * @notice Remove Loan Limits
     * @dev Removes the entire limits array
     */
    function removeLoanLimits() public onlyAdmin {
        for (uint256 i = 0; i < stabilizers.length;) {
            delete limits[stabilizers[i]];
            stabilizers[i] = address(0);
            unchecked { ++i; }
        }

        emit LimitsRemoved();
    }

    /**
     * @notice Remove Loan Limit
     * @dev removes a loan limit from the limits map and the stabilizer from the array
     * @param _stabilizer stabilizer to be removed
     */
    function removeLoanLimit(address _stabilizer) external onlyHotWallet {
        delete limits[_stabilizer];
        
        for (uint256 i = 0; i < stabilizers.length;) {
            if (stabilizers[i] == _stabilizer) {
                stabilizers[i] = stabilizers[stabilizers.length - 1];
                stabilizers.pop();
                break;
            }
            unchecked { ++i; }
        }

        emit LimitRemoved(_stabilizer);
    }

    /**
     * @notice Set Hot Wallet
     * @dev sets the wallet address that will be use to propose the new limits and interest rate
     * @param _hot_wallet address to be assigned
     */
    function setHotWallet(address _hot_wallet) external onlyAdmin {
        if(_hot_wallet == address(0)) revert ZeroAddress();
        hot_wallet = _hot_wallet;
        emit HotWalletChanged(_hot_wallet);
    }

    /**
     * @notice Execute
     * @dev sets the interest rate to the stored value and sets new loan limits by auto-calling or auto-investing stabilizers
     */
    function execute() external onlyAdmin {
        SWEEP.setInterestRate(next_interest_rate);

        for (uint256 i = 0; i < stabilizers.length;) {
            address _stabilizer = stabilizers[i];
            uint248 new_limit = limits[_stabilizer].amount;
            bool auto_invest = limits[_stabilizer].auto_invest;

            // is valid minter
            if(SWEEP.isValidMinter(_stabilizer)){
                IStabilizer stabilizer = IStabilizer(_stabilizer);
                uint256 old_limit = stabilizer.loan_limit();
                stabilizer.setLoanLimit(new_limit);

                if(auto_invest) {
                    if( new_limit > old_limit ){
                        stabilizer.autoInvest(new_limit - old_limit);
                    } else {
                        stabilizer.autoCall(old_limit - new_limit);
                    }
                }
            }

            delete limits[_stabilizer];
            stabilizers[i] = address(0);

            unchecked { ++i; }
        }

        emit BalancerExecuted();
    }
}

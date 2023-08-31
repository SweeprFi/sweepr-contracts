// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.19;

import "./ITransferApprover.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";

/**
 * @title VestingApprover
 */
contract VestingApprover is ITransferApprover, Ownable {
    IERC20Metadata public sweepr;

    // Structure for the vesting schedule
    struct VestingSchedule {
        // beneficiary address
        address beneficiary;
        // Cliff time when vesting begins
        uint256 startTime;
        // The amount of time for linear vesting
        uint256 vestingTime;
        // The number of tokens that are controlled by the vesting schedule
        uint256 vestingAmount;
        // amount of tokens transferred
        uint256 transferredAmount;
    }

    // Vesting Schedules
    mapping(address => VestingSchedule) public vestingSchedules;
    // Beneficiary Addresses
    address[] public beneficiaries;

    /* ========== EVENTS ========== */
    event ScheduleAdded(
        address indexed beneficiary,
        uint256 startTime,
        uint256 vestingtime,
        uint256 vestingAmount
    );
    event ScheduleRemoved(address indexed beneficiary);
    event Whitelisted(address indexed account);
    event UnWhitelisted(address indexed account);
    event StateSet(bool state);

    /* ========== Errors ========== */
    error NotSweepr();
    error ZeroAddressDetected();
    error ZeroAmountDetected();

    /* ========== MODIFIERS ========== */
    modifier onlySweepr() {
        if (msg.sender != address(sweepr)) revert NotSweepr();
        _;
    }

    /* ========== CONSTRUCTOR ========== */
    constructor(address sweeprAddress) {
        sweepr = IERC20Metadata(sweeprAddress);
    }

    /**
     * @notice Creates a new vesting schedule for a beneficiary
     * @param _beneficiary address of the beneficiary
     * @param _startTime start time of the vesting period
     * @param _vestingTime amount of time in seconds for linear vesting
     * @param _vestingAmount amount of tokens that are controlled by the vesting schedule
     */
    function createVestingSchedule(
        address _beneficiary,
        uint256 _startTime,
        uint256 _vestingTime,
        uint256 _vestingAmount
    ) external onlyOwner {
        if (_beneficiary == address(0)) revert ZeroAddressDetected();
        if (_startTime == 0 || _vestingTime == 0 || _vestingAmount == 0)
            revert ZeroAmountDetected();

        vestingSchedules[_beneficiary] = VestingSchedule(
            _beneficiary,
            _startTime,
            _vestingTime,
            _vestingAmount,
            0
        );

        beneficiaries.push(_beneficiary);
        emit ScheduleAdded(
            _beneficiary,
            _startTime,
            _vestingTime,
            _vestingAmount
        );
    }

    /**
     * @notice Remove vesting schedule
     * @param itemIndex index to remove
     */
    function removeSchedule(uint256 itemIndex) external onlyOwner {
        address beneficiary = beneficiaries[itemIndex];
        delete vestingSchedules[beneficiary];

        beneficiaries[itemIndex] = beneficiaries[beneficiaries.length - 1];
        beneficiaries.pop();

        emit ScheduleRemoved(beneficiary);
    }

    /**
     * @notice Returns token transferability
     * @param from sender address
     * @param to beneficiary address
     * @param amount transfer amount
     * @return (bool) true - allowance, false - denial
     */
    function checkTransfer(
        address from,
        address to,
        uint256 amount
    ) external onlySweepr returns (bool) {
        // allow minting & burning
        if (from == address(0) || to == address(0)) return true;
        // Check if sender has enough balancer
        if (sweepr.balanceOf(from) < amount) return false;
        // Check if sender is not be beneficiary
        if (vestingSchedules[from].beneficiary != address(0)) return false;
        // Check if receiver is valid beneficiary
        if (vestingSchedules[to].beneficiary == address(0)) return false;

        VestingSchedule storage vestingSchedule = vestingSchedules[to];
        uint256 vestedAmount = _computeTransferableAmount(vestingSchedule);

        if (vestedAmount < amount) return false;

        vestingSchedule.transferredAmount =
            vestingSchedule.transferredAmount +
            amount;

        return true;
    }

    /**
     * @dev Computes the transferable amount of tokens for a vesting schedule.
     * @return the amount of transferable tokens
     */
    function _computeTransferableAmount(VestingSchedule memory vestingSchedule)
        internal
        view
        returns (uint256)
    {
        uint256 currentTime = getCurrentTime();

        // If the current time is before the cliff, no tokens are transferable.
        if (currentTime < vestingSchedule.startTime) {
            return 0;
        } else if (
            currentTime >=
            vestingSchedule.startTime + vestingSchedule.vestingTime
        ) {
            // If the current time is after the vesting period, all tokens are transferaable,
            // minus the amount already transferred.
            return
                vestingSchedule.vestingAmount -
                vestingSchedule.transferredAmount;
        } else {
            // Compute the amount of tokens that are vested.
            uint256 vestedAmount = (vestingSchedule.vestingAmount *
                (currentTime - vestingSchedule.startTime)) /
                vestingSchedule.vestingTime;

            // Subtract the amount already transferred and return.
            return vestedAmount - vestingSchedule.transferredAmount;
        }
    }

    /**
     * @dev Returns the number of vesting schedules
     * @return the number of vesting schedules
     */
    function getVestingSchedulesCount() external view returns (uint256) {
        return beneficiaries.length;
    }

    /**
     * @notice Get the vested amount of tokens for beneficiary
     * @return the vested amount
     */
    function getLockedAmount(address beneficiary)
        external
        view
        returns (uint256)
    {
        VestingSchedule storage vestingSchedule = vestingSchedules[beneficiary];
        return _computeTransferableAmount(vestingSchedule);
    }

    /**
     * @notice Returns the vesting schedule information for a given address.
     * @return the vesting schedule structure information
     */
    function getVestingSchedule(address beneficiary)
        external
        view
        returns (VestingSchedule memory)
    {
        if (beneficiary == address(0)) revert ZeroAddressDetected();
        return vestingSchedules[beneficiary];
    }

    /**
     * @dev Returns the current time.
     * @return the current timestamp in seconds.
     */
    function getCurrentTime() internal view virtual returns (uint256) {
        return block.timestamp;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../Sweep/TransferApprover/VestingApprover.sol";

/**
 * @title MockTokenVesting
 * WARNING: use only for testing and debugging purpose
 */
contract VestingApproverMock is VestingApprover {
    uint256 mockTime = 0;

    constructor(address sweeprAddress) VestingApprover(sweeprAddress) {}

    function setCurrentTime(uint256 _time) external {
        mockTime = _time;
    }

    function getCurrentTime() internal view virtual override returns (uint256) {
        return mockTime;
    }
}
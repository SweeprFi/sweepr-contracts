// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IGTokenMock {
    function currentEpoch() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);
}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IRewardTracker {
    function rewardToken() external view returns (address);

    function decimals() external view returns (uint8);

    function claimable(address account) external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function claim(address receiver) external returns (uint256);
}

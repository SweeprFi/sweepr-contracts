// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.16;

interface IRewardTracker {
    function rewardToken() external view returns (address);

    function decimals() external view returns (uint8);

    function claimable(address account) external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function claim(address receiver) external returns (uint256);
}

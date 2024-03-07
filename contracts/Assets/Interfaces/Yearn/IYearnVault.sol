// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IYearnVault {
    function balanceOf(address) external view returns(uint256);
    function deposit(uint256 _amount) external;
    function withdraw(uint256 _amount) external;
    function pricePerShare() external view returns(uint256);
}

interface IYearnStaking {
    function withdraw(uint256 _amount) external;
    function stake(uint256 _amount) external;
    function getReward() external;
    function balanceOf(address) external view returns(uint256);
}
// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IYieldYakStrategy {
    function balanceOf(address) external view returns(uint256);

    function getSharesForDepositTokens(uint256) external view returns(uint256);

    function getDepositTokensForShares(uint256) external view returns(uint256);
    
    function deposit(uint256 _amount) external;

    function withdraw(uint256 _amount) external;
}
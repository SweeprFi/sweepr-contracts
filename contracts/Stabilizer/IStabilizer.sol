// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IStabilizer {
    function loanLimit() external view returns (uint256);

    function cancelCall() external;

    function autoCall(uint256 amount, uint256 price, uint256 slippage) external;

    function autoInvest(uint256 amount, uint256 price, uint256 slippage) external;
    
    function setLoanLimit(uint256 amount) external;
}

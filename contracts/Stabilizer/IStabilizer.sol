// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.16;

interface IStabilizer {
    function loan_limit() external view returns (uint256);

    function autoCall(uint256 amount) external;

    function autoInvest(uint256 amount) external;
    
    function setLoanLimit(uint256 amount) external;
}

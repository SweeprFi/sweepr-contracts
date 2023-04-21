// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.16;

interface IStabilizer {
    function frozen() external view returns (bool);

    function sweep_borrowed() external view returns (uint256);

    function auto_invest() external view returns (bool);

    function auto_invest_min_amount() external view returns (uint256);

    function repaymentCall(uint256 amount) external;

    function autoInvest(uint256 amount) external;
}

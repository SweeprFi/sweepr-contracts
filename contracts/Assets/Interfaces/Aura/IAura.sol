// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import { IBalancerVault } from "../Balancer/IBalancer.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";

interface IDepositWrapper {
    
    function depositSingle(address, address, uint256, bytes32, IBalancerVault.JoinPoolRequest memory request) external payable;
    // function depositSingle(address, address, uint256, bytes32, (address[],uint256[],bytes,bool));
    function withdraw(address _asset, uint256 _amount, bool _collateralOnly) external returns (uint256 withdrawnAmount, uint256 withdrawnShare);
}


interface IBaseRewardPool is IERC4626 {
    function getReward() external returns(bool);
    function withdrawAndUnwrap(uint256 amount, bool claim) external;
}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IHedgeExchangerMock {
    function WHITELIST_ROLE() external view returns (bytes32);
    function DEFAULT_ADMIN_ROLE() external view returns (bytes32);
    
    function hasRole(bytes32 role, address blockGetter) external view returns (bool);

    function setBlockGetter(address blockGetter) external;
    function grantRole(bytes32 role, address account) external;
}

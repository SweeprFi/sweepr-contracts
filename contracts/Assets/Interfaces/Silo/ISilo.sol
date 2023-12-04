// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";

interface ISilo {
    function deposit(address _asset, uint256 _amount, bool _collateralOnly) external returns (uint256 collateralAmount, uint256 collateralShare);
    function withdraw(address _asset, uint256 _amount, bool _collateralOnly) external returns (uint256 withdrawnAmount, uint256 withdrawnShare);
}

interface ISiloLens {
    function getDepositAmount(address _silo, address _asset, address _user, uint256 _timestamp) external view returns (uint256);
}


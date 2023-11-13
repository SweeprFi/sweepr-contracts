// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";

interface IBalancerVault {
    struct JoinPoolRequest {
        IAsset[] assets;
        uint256[] maxAmountsIn;
        bytes userData;
        bool fromInternalBalance;
    }

    struct ExitPoolRequest {
        IAsset[] assets;
        uint256[] minAmountsOut;
        bytes userData;
        bool toInternalBalance;
    }

    function joinPool(bytes32 poolId, address sender, address recipient, JoinPoolRequest memory request) external payable;
    function exitPool(bytes32 poolId, address sender, address recipient, ExitPoolRequest memory request) external payable;
    function getPoolTokens(bytes32 poolId) external view returns (IAsset[] memory tokens, uint256[] memory balances, uint256 lastChangeBlock);
}

interface IAsset {
    // solhint-disable-previous-line no-empty-blocks
}

interface IBalancerPool is IERC20Metadata {
    function getPoolId() external view returns (bytes32);
    function getVault() external view returns (address);
    function getRate() external view returns (uint256);
    function swap(SingleSwap memory singleSwap, FundManagement memory funds, uint256 limit, uint256 deadline) external returns (uint256 amountOut);
}

enum SwapKind { GIVEN_IN, GIVEN_OUT }

struct SingleSwap {
   bytes32 poolId;
   SwapKind kind;
   IAsset assetIn;
   IAsset assetOut;
   uint256 amount;
   bytes userData;
}

struct FundManagement {
    address sender;
    bool fromInternalBalance;
    address payable recipient;
    bool toInternalBalance;
}

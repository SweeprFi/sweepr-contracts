// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== MapleAsset.sol ========================
// ====================================================================

/**
 * @title Maple Asset
 * @dev Representation of an on-chain investment
 */
import {IMaplePool} from "./Maple/IMaplePool.sol";
import {ERC4626Asset} from "./ERC4626Asset.sol";

contract MapleAsset is ERC4626Asset {

    constructor(
        address borrower
    ) ERC4626Asset(
        "MapleAsset",
        0xB88a5Ac00917a02d82c7cd6CEBd73E2852d43574, // SWEEP
        0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48, // USDC
        0xfe119e9C24ab79F1bDd5dd884B86Ceea2eE75D92, // MAPLE'S ERC4626 POOL
        0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6, // USDC-USD ORACLE
        borrower
    ) {
        
    }

     /* ========== Actions ========== */

    /**
     * @notice requestWithdraw.
     * @param usdxAmount Amount to be requested
     * @dev requests Maple for usdxAmount to be withdrawn
     */
    function requestWithdraw(uint256 usdxAmount) public onlyBorrower {
        IMaplePool(address(asset)).requestWithdraw(usdxAmount, address(this));
    }

    /**
     * @notice forceRequestWithdraw.
     * @param usdxAmount Amount to be requested
     * @dev requests Maple for usdxAmount to be withdrawn
     */
    function forceRequestWithdraw(uint256 usdxAmount) external {
        if(msg.sender != sweep.fastMultisig()) revert ActionNotAllowed();
        if(!isDefaulted()) revert NotDefaulted();
        IMaplePool(address(asset)).requestWithdraw(usdxAmount, address(this));
    }

    /**
     * @notice requestWithdraw.
     * @param usdxAmount Amount to be requested
     * @dev requests Maple for usdxAmount to be withdrawn
     */
    function forceDivest(uint256 usdxAmount) external nonReentrant {
        if(msg.sender != sweep.fastMultisig()) revert ActionNotAllowed();
        if(!isDefaulted()) revert NotDefaulted();
        super._divest(usdxAmount, 0);
    }

}

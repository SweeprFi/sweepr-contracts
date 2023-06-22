// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ====================== TokenDistributor.sol ========================
// ====================================================================

/**
 * @title Token Distributor
 * @dev Implementation:
 * Buy & sell SWEEPR.
 * Send remaining tokens to treasury after SWEEPR distribution.
 */

import "./Sweepr.sol";
import "../Common/Owned.sol";

contract TokenDistributor is Owned {
    SweeprCoin public sweepr;
    uint256 private constant PRECISION = 1e6;

    /* ========== EVENTS ========== */
    event SweeprBought(address indexed to, uint256 sweeprAmount);
    event SweeprSold(address indexed to, uint256 sweepAmount);

    /* ========== Errors ========== */
    error NotEnoughBalance();

    /* ========== CONSTRUCTOR ========== */
    constructor(
        address sweepAddress_, 
        address sweeprAddress
    ) Owned(sweepAddress_) {
        sweepr = SweeprCoin(sweeprAddress);
    }

    /* ========== PUBLIC FUNCTIONS ========== */
    /**
     * @notice A function to buy sweepr.
     * @param sweepAmount sweep Amount to buy sweepr
     */
    function buy(uint256 sweepAmount) external {
        uint256 sweeprBalance = sweepr.balanceOf(address(this));
        uint256 sweeprAmount = (sweepAmount * sweepr.price()) / PRECISION;

        if (sweeprAmount > sweeprBalance) revert NotEnoughBalance();
        
        TransferHelper.safeTransferFrom(address(sweep), msg.sender, address(this), sweepAmount);
        TransferHelper.safeTransfer(address(sweepr), msg.sender, sweeprAmount);

        emit SweeprBought(msg.sender, sweeprAmount);
    }

    /**
     * @notice A function to sell sweepr.
     * @param sweeprAmount sweepr Amount to sell
     */
    function sell(uint256 sweeprAmount) external {
        uint256 sweepBalance = sweep.balanceOf(address(this));
        uint256 sweepAmount = (sweeprAmount * PRECISION) / sweepr.price();

        if (sweepAmount > sweepBalance) revert NotEnoughBalance();
        
        TransferHelper.safeTransferFrom(address(sweepr), msg.sender, address(this), sweeprAmount);
        TransferHelper.safeTransfer(address(sweep), msg.sender, sweepAmount);

        emit SweeprBought(msg.sender, sweepAmount);
    }

    /* ========== RESTRICTED FUNCTIONS ========== */
    /**
     * @notice A function to send remaining tokens to treasury after distribution.
     * @param tokenAddress token address to send
     * @param tokenAmount token amount to send
     */
    function recover(
        address tokenAddress, 
        uint256 tokenAmount
    ) external onlyGov {
        TransferHelper.safeTransfer(address(tokenAddress), sweep.treasury(), tokenAmount);
    }
}
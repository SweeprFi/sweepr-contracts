// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ======================== TokenDistributor ============================
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
    event SweeprBought(address indexed to, uint256 sweepr_amount);
    event SweeprSold(address indexed to, uint256 sweep_amount);

    /* ========== Errors ========== */
    error NotEnoughBalance();

    /* ========== CONSTRUCTOR ========== */
    constructor(
        address _sweep_address, 
        address _sweepr_address
    ) Owned(_sweep_address) {
        sweepr = SweeprCoin(_sweepr_address);
    }

    /* ========== PUBLIC FUNCTIONS ========== */
    /**
     * @notice A function to buy sweepr.
     * @param _sweep_amount sweep Amount to buy sweepr
     */
    function buy(uint256 _sweep_amount) external {
        uint256 sweepr_balance = sweepr.balanceOf(address(this));
        uint256 sweepr_amount = (_sweep_amount * sweepr.price()) / PRECISION;

        if (sweepr_amount > sweepr_balance) revert NotEnoughBalance();
        
        TransferHelper.safeTransferFrom(address(SWEEP), msg.sender, address(this), _sweep_amount);
        TransferHelper.safeTransfer(address(sweepr), msg.sender, sweepr_amount);

        emit SweeprBought(msg.sender, sweepr_amount);
    }

    /**
     * @notice A function to sell sweepr.
     * @param _sweepr_amount sweepr Amount to sell
     */
    function sell(uint256 _sweepr_amount) external {
        uint256 sweep_balance = SWEEP.balanceOf(address(this));
        uint256 sweep_amount = (_sweepr_amount * PRECISION) / sweepr.price();

        if (sweep_amount > sweep_balance) revert NotEnoughBalance();
        
        TransferHelper.safeTransferFrom(address(sweepr), msg.sender, address(this), _sweepr_amount);
        TransferHelper.safeTransfer(address(SWEEP), msg.sender, sweep_amount);

        emit SweeprBought(msg.sender, sweep_amount);
    }

    /* ========== RESTRICTED FUNCTIONS ========== */
    /**
     * @notice A function to send remaining tokens to treasury after distribution.
     * @param _token_address token address to send
     * @param _token_amount token amount to send
     */
    function recover(
        address _token_address, 
        uint256 _token_amount
    ) external onlyGov {
        TransferHelper.safeTransfer(address(_token_address), SWEEP.treasury(), _token_amount);
    }
}
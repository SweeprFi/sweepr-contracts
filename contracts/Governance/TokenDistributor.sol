// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ======================== TokenDistributor ============================
// ====================================================================

/**
 * @title Token Distributor
 * @dev Implementation:
 * Buy & sell SWEEPER.
 * Send remaining tokens to treasury after SWEEPER distribution.
 */

import "./Sweeper.sol";
import "../Common/Owned.sol";

contract TokenDistributor is Owned {
    SWEEPER public sweeper;
    uint256 private constant PRECISION = 1e6;

    /* ========== EVENTS ========== */
    event SweeperBought(address indexed to, uint256 sweeper_amount);
    event SweeperSold(address indexed to, uint256 sweep_amount);

    /* ========== Errors ========== */
    error NotEnoughBalance();

    /* ========== CONSTRUCTOR ========== */
    constructor(
        address _sweep_address, 
        address _sweeper_address
    ) Owned(_sweep_address) {
        sweeper = SWEEPER(_sweeper_address);
    }

    /* ========== PUBLIC FUNCTIONS ========== */
    /**
     * @notice A function to buy sweeper.
     * @param _sweep_amount sweep Amount to buy sweeper
     */
    function buy(uint256 _sweep_amount) external {
        uint256 sweeper_balance = sweeper.balanceOf(address(this));
        uint256 sweeper_amount = (_sweep_amount * sweeper.price()) / PRECISION;

        if (sweeper_amount > sweeper_balance) revert NotEnoughBalance();
        
        TransferHelper.safeTransferFrom(address(SWEEP), msg.sender, address(this), _sweep_amount);
        TransferHelper.safeTransfer(address(sweeper), msg.sender, sweeper_amount);

        emit SweeperBought(msg.sender, sweeper_amount);
    }

    /**
     * @notice A function to sell sweeper.
     * @param _sweeper_amount sweeper Amount to sell
     */
    function sell(uint256 _sweeper_amount) external {
        uint256 sweep_balance = SWEEP.balanceOf(address(this));
        uint256 sweep_amount = (_sweeper_amount * PRECISION) / sweeper.price();

        if (sweep_amount > sweep_balance) revert NotEnoughBalance();
        
        TransferHelper.safeTransferFrom(address(sweeper), msg.sender, address(this), _sweeper_amount);
        TransferHelper.safeTransfer(address(SWEEP), msg.sender, sweep_amount);

        emit SweeperBought(msg.sender, sweep_amount);
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
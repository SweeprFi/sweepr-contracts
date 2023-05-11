// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;
pragma experimental ABIEncoderV2;

// ====================================================================
// ========================== Treasury.sol ============================
// ====================================================================

/**
 * @title Treasury
 * @dev Manages the fees paid to the protocol
 */

import "../Common/Owned.sol";
import "../Utils/Address.sol";
import "../Common/TransferHelper.sol";

contract Treasury is Owned {
    address private sweeper;

    // Events
    event Execute(address indexed to, bytes data);
    event RecoverEth(address to, uint256 amount);
    event RecoverSWEEP(address to, uint256 amount);
    event RecoverToken(address token, address to, uint256 amount);
    event SWEEPERSet(address sweeper);

    // Errors
    error NotSWEEPER();

    constructor(address _sweep) Owned(_sweep) {}


    /* ========== Modifies ========== */

    modifier onlySWEEPER() {
        if (msg.sender != sweeper) revert NotSWEEPER();
        _;
    }

    /* ========== Actions ========== */

    /**
     * @notice Receive Eth
     */
    receive() external payable {}

    /**
     * @notice Send Eth
     * @param _receiver address
     * @param _amount Eth amount
     */
    function sendEth(address _receiver, uint256 _amount) external onlyAdmin {
        uint256 eth_balance = address(this).balance;
        if (_amount > eth_balance) _amount = eth_balance;

        TransferHelper.safeTransferETH(_receiver, _amount);

        emit RecoverEth(_receiver, _amount);
    }

    /**
     * @notice Recover SWEEP
     * @param _receiver address
     * @param _amount SWEEP amount
     */
    function recoverSWEEP(address _receiver, uint256 _amount) external onlySWEEPER {
        uint256 sweep_balance = SWEEP.balanceOf(address(this));
        if (_amount > sweep_balance) _amount = sweep_balance;

        TransferHelper.safeTransfer(address(SWEEP), _receiver, _amount);

        emit RecoverSWEEP(_receiver, _amount);
    }

    /**
     * @notice Recover ERC20 Token
     * @param _token address
     * @param _receiver address
     * @param _amount SWEEP amount
     */
    function sendToken(address _token, address _receiver, uint256 _amount) external onlyAdmin {
        uint256 token_balance = IERC20(_token).balanceOf(address(this));
        if (_amount > token_balance) _amount = token_balance;

        TransferHelper.safeTransfer(_token, _receiver, _amount);

        emit RecoverToken(_token, _receiver, _amount);
    }

    /**
     * @notice Set SWEEPER address
     * @param _sweeper SWEEPER address
     */
    function setSWEEPER(address _sweeper) external onlyAdmin {
        require(_sweeper != address(0), "Zero address detected");
        sweeper = _sweeper;

        emit SWEEPERSet(_sweeper);
    }
}

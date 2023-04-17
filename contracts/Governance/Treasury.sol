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
    event RecoverEth(uint256 amount);
    event RecoverSWEEP(uint256 amount);
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
     * @notice Execute encoded data
     * @param _to address
     * @param _data Encoded data
     */
    function execute(address _to, bytes memory _data) external onlyAdmin {
        bytes memory returndata = Address.functionCall(_to, _data);
        if (returndata.length > 0) {
            require(abi.decode(returndata, (bool)), "Execute failed");
        }

        emit Execute(_to, _data);
    }

    /**
     * @notice Recover Eth
     * @param _amount Eth amount
     */
    function recoverEth(uint256 _amount) external onlyAdmin {
        uint256 eth_balance = address(this).balance;
        if (_amount > eth_balance) _amount = eth_balance;

        TransferHelper.safeTransferETH(msg.sender, _amount);

        emit RecoverEth(_amount);
    }

    /**
     * @notice Recover SWEEP
     * @param _amount SWEEP amount
     */
    function recoverSWEEP(address _receiver, uint256 _amount) external onlySWEEPER {
        uint256 sweep_balance = SWEEP.balanceOf(address(this));
        if (_amount > sweep_balance) _amount = sweep_balance;

        TransferHelper.safeTransfer(address(SWEEP), _receiver, _amount);

        emit RecoverSWEEP(_amount);
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

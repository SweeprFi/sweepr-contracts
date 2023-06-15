// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= Transfer Approver ========================
// ====================================================================

import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title Sweep Transfer Approver
 * @dev Allows accounts to be whitelisted by admin role
 */
contract TransferApproverWhitelist is Ownable2Step {
    mapping(address => bool) internal whitelisted;

    event Whitelisted(address indexed account);
    event UnWhitelisted(address indexed account);

    /**
     * @notice Returns token transferability
     * @param from sender address
     * @param to beneficiary address
     * @return (bool) true - allowance, false - denial
     */
    function checkTransfer(address from, address to)
        external
        view
        returns (bool)
    {
        if (from == address(0) || to == address(0)) return true;

        return whitelisted[to];
    }

    /**
     * @dev Checks if account is whitelisted
     * @param account The address to check
     */
    function isWhitelisted(address account) external view returns (bool) {
        return whitelisted[account];
    }

    /**
     * @dev Adds account to whitelist
     * @param account The address to whitelist
     */
    function whitelist(address account) external onlyOwner {
        whitelisted[account] = true;

        emit Whitelisted(account);
    }

    /**
     * @dev Removes account from whitelist
     * @param account The address to remove from the blacklist
     */
    function unWhitelist(address account) external onlyOwner {
        whitelisted[account] = false;

        emit UnWhitelisted(account);
    }
}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= Transfer Approver ========================
// ====================================================================

import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title Sweep Transfer Approver
 * @dev Allows accounts to be blacklisted by admin role
 */
contract TransferApproverBlacklist is Ownable2Step {
    mapping(address => bool) internal blacklisted;

    event Blacklisted(address indexed account);
    event UnBlacklisted(address indexed account);

    /**
     * @notice Returns token transferability
     * @param from sender address
     * @param to beneficiary address
     * @return (bool) true - allowance, false - denial
     */
    function checkTransfer(
        address from,
        address to
    ) external view returns (bool) {
        if (from == address(0) || to == address(0)) return true;

        return (!blacklisted[from] && !blacklisted[to]);
    }

    /**
     * @dev Checks if account is blacklisted
     * @param account The address to check
     */
    function isBlacklisted(address account) external view returns (bool) {
        return blacklisted[account];
    }

    /**
     * @dev Adds account to blacklist
     * @param account The address to blacklist
     */
    function blacklist(address account) external onlyOwner {
        blacklisted[account] = true;

        emit Blacklisted(account);
    }

    /**
     * @dev Removes account from blacklist
     * @param account The address to remove from the blacklist
     */
    function unBlacklist(address account) external onlyOwner {
        blacklisted[account] = false;

        emit UnBlacklisted(account);
    }
}

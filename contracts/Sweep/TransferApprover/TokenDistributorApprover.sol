// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";

/**
 * @title TokenDistributorApprover
 */
contract TokenDistributorApprover is Ownable {
    IERC20Metadata public sweepr;
    address public tokenDistributor;

    /* ========== EVENTS ========== */
    event TokenDistributorChanged(address indexed newTokenDistributor);

    /* ========== Errors ========== */
    error ZeroAddressDetected();

    /* ========== CONSTRUCTOR ========== */
    constructor(
        address sweeprAddress,
        address tokenDistributorAddress
    ) {
        sweepr = IERC20Metadata(sweeprAddress);
        tokenDistributor = tokenDistributorAddress;
    }

    /**
     * @notice Returns token transferability
     * @param from sender address
     * @param to beneficiary address
     * @return (bool) true - allowance, false - denial
     */
    function checkTransfer(
        address from, 
        address to,
        uint256 amount
    ) external view returns (bool) {
        if (from == address(0) || to == address(0)) return true;
        if (
            (from == tokenDistributor || to == tokenDistributor) && 
            (sweepr.balanceOf(from) >= amount)
        ) return true;

        return false;
    }

    function setTokenDistributor(address newTokenDistributor) external onlyOwner {
        if (newTokenDistributor == address(0)) revert ZeroAddressDetected();
        tokenDistributor = newTokenDistributor;

        emit TokenDistributorChanged(newTokenDistributor);
    }
}

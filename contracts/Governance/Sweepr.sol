// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@layerzerolabs/solidity-examples/contracts/token/oft/OFT.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "../Sweep/TransferApprover/ITransferApprover.sol";

contract SweeprCoin is OFT, ERC20Burnable, ERC20Permit, ERC20Votes {
    ITransferApprover private transferApprover;

    bool public isGovernanceChain;

    /// @notice SWEEPR price. This is in SWEEP
    uint256 public price = 1e6; // 1 SWEEP
    uint256 private constant PRECISION = 1e6;

    /* ========== EVENTS ========== */
    event TokenMinted(address indexed to, uint256 amount);
    event SweeprPriceSet(uint256 price);
    event ApproverSet(address indexed approver);
    event GovernanceChainSet(bool isGovernance);

    /* ========== Errors ========== */
    error TransferNotAllowed();
    error ZeroAddressDetected();
    error NotGovernanceChain();

    /* ========== CONSTRUCTOR ========== */
    constructor(
        bool isGovernance,
        address lzEndpoint
    ) OFT("SweeprCoin", "SWEEPR", lzEndpoint) ERC20Permit("SweeprCoin") {
        isGovernanceChain = isGovernance;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */
    function mint(address receiver, uint256 amount) external onlyOwner {
        if (!isGovernanceChain) revert NotGovernanceChain();
        _mint(receiver, amount);

        emit TokenMinted(receiver, amount);
    }

    function setGovernanceChain(bool isGovernance) external onlyOwner {
        isGovernanceChain = isGovernance;

        emit GovernanceChainSet(isGovernance);
    }

    function setPrice(uint256 newPrice) external onlyOwner {
        price = newPrice;

        emit SweeprPriceSet(newPrice);
    }

    function setTransferApprover(address newApprover) external onlyOwner {
        if (newApprover == address(0)) revert ZeroAddressDetected();
        transferApprover = ITransferApprover(newApprover);

        emit ApproverSet(newApprover);
    }

    /* ========== OVERRIDDEN FUNCTIONS ========== */
    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override
    {
        if (
            address(transferApprover) != address(0) &&
            !transferApprover.checkTransfer(from, to)
        ) revert TransferNotAllowed();

        super._beforeTokenTransfer(from, to, amount);
    }

    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._burn(account, amount);
    }
}
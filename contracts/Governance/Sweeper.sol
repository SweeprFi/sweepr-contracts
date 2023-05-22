// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import "../Governance/Treasury.sol";
import "../Sweep/TransferApprover/ITransferApprover.sol";
import "../Common/Owned.sol";

contract SWEEPER is ERC20, ERC20Burnable, Owned, ERC20Permit, ERC20Votes {
    ITransferApprover private transferApprover;

    /// @notice sweeper price. This is in SWEEP
    uint256 public price = 1e6; // 1 SWEEP
    uint256 private constant PRECISION = 1e6;

    /* ========== EVENTS ========== */
    event TokenMinted(address indexed to, uint256 amount);
    event SweeperPriceSet(uint256 price);

    /* ========== Errors ========== */
    error TransferNotAllowed();

    /* ========== CONSTRUCTOR ========== */
    constructor(
        address _sweep_address, 
        address _approver_address
    ) ERC20("SWEEPER", "SWEEPER") ERC20Permit("SWEEPER") Owned(_sweep_address) {
        transferApprover = ITransferApprover(_approver_address);
    }

    /* ========== RESTRICTED FUNCTIONS ========== */
    function mint(address _receiver, uint256 _amount) external onlyGov {
        _mint(_receiver, _amount);

        emit TokenMinted(_receiver, _amount);
    }

    function setPrice(uint256 _new_price) external onlyGov {
        price = _new_price;

        emit SweeperPriceSet(_new_price);
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
// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@layerzerolabs/solidity-examples/contracts/token/oft/OFT.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import "../Governance/Treasury.sol";
import "../Sweep/TransferApprover/ITransferApprover.sol";
import "../Common/Owned.sol";

contract SweeprCoin is OFT, ERC20Burnable, Owned, ERC20Permit, ERC20Votes {
    ITransferApprover private transferApprover;

    /// @notice SWEEPR price. This is in SWEEP
    uint256 public price = 1e6; // 1 SWEEP
    uint256 private constant PRECISION = 1e6;

    /* ========== EVENTS ========== */
    event TokenMinted(address indexed to, uint256 amount);
    event SweeprPriceSet(uint256 price);
    event ApproverSet(address indexed approver);

    /* ========== Errors ========== */
    error TransferNotAllowed();

    /* ========== CONSTRUCTOR ========== */
    constructor(
        address _sweep_address,
        address _lzEndpoint
    ) OFT("SweeprCoin", "SWEEPR", _lzEndpoint) ERC20Permit("SweeprCoin") Owned(_sweep_address) {}

    /* ========== RESTRICTED FUNCTIONS ========== */
    function mint(address _receiver, uint256 _amount) external onlyGov {
        _mint(_receiver, _amount);

        emit TokenMinted(_receiver, _amount);
    }

    function setPrice(uint256 _new_price) external onlyGov {
        price = _new_price;

        emit SweeprPriceSet(_new_price);
    }

    function setTransferApprover(address _approver) external onlyGov {
        if (_approver == address(0)) revert ZeroAddressDetected();
        transferApprover = ITransferApprover(_approver);

        emit ApproverSet(_approver);
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
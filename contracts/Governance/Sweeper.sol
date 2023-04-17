// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "../Common/TransferHelper.sol";
import "../Governance/Treasury.sol";
import "../Sweep/ISweep.sol";
import "../Sweep/TransferApprover/ITransferApprover.sol";

contract SWEEPER is ERC20, ERC20Burnable, Pausable, Ownable, ERC20Permit, ERC20Votes {
    ISweep private SWEEP;
    ITransferApprover private transferApprover;
    Treasury private treasury;

    /// @notice If mintBurnAddress is set, we can only mint and burn with transactions from this address
    /// This will allow us to control batch sales
    address public mintBurnAddress;

    /// @notice sweeper price. This is in USDC
    uint256 public price = 1e6; // 1 USDC
    uint256 private PRECISION = 1e6;

    /// @notice allow minting
    bool public allowMinting;

    /// @notice allow burning
    bool public allowBurning;

    /// @notice treasury target (percentage) ex: 10,000 == 1%
    /// P = market capitalization, B = treasury SWEEP, A = all SWEEP
    /// If P/B > 2 & B/A < treasuryTarget, Mint and sell SWEEPER
    /// If P/B < 1 & B/A > treasuryTarget, Buy back and burn SWEEPER
    uint256 public targetTreasury = 50000; // 5%

    /* ========== Modifies ========== */

    modifier onlyAdmin() {
        if (mintBurnAddress != address(0) && msg.sender != SWEEP.owner()) revert NotAdmin();
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    constructor(
        address _sweep_address, 
        address _approver_address,
        address payable _treasury_address
    ) ERC20("SWEEPER", "SWEEPER") ERC20Permit("SWEEPER") {
        SWEEP = ISweep(_sweep_address);
        transferApprover = ITransferApprover(_approver_address);
        treasury = Treasury(_treasury_address);
        mintBurnAddress = SWEEP.owner();
    }

    function buySWEEPER(uint256 SWEEPAmount) external onlyAdmin {
        if (!allowMinting) revert MintNotAllowed();

        uint256 SWEEPERAmount = (SWEEPAmount * SWEEP.target_price()) / price;
        uint256 treasurySWEEP = SWEEP.balanceOf(address(treasury));
        uint256 treasuryPercent = ((treasurySWEEP + SWEEPAmount) * PRECISION) / SWEEP.totalSupply();

        if (treasuryPercent > targetTreasury)
            revert GreaterThanTargetTreasury();

        address receiver;
        if (mintBurnAddress != address(0)) {
            receiver = mintBurnAddress;
        } else {
            receiver = msg.sender;
        }

        TransferHelper.safeTransferFrom(
            address(SWEEP),
            receiver,
            address(treasury),
            SWEEPAmount
        );
        _mint(receiver, SWEEPERAmount);

        emit SweeperBought(SWEEPERAmount);
    }

    function sellSWEEPER(uint256 SWEEPERAmount) external onlyAdmin {
        if (!allowBurning) revert BurnNotAllowed();

        uint256 SWEEPAmount = (SWEEPERAmount * price) / SWEEP.target_price();
        uint256 treasurySWEEP = SWEEP.balanceOf(address(treasury));
        uint256 treasuryPercent = ((treasurySWEEP - SWEEPAmount) * PRECISION) / SWEEP.totalSupply();

        if (treasuryPercent < targetTreasury)
            revert SmallerThanTargetTreasury();

        address receiver;
        if (mintBurnAddress != address(0)) {
            receiver = mintBurnAddress;
        } else {
            receiver = msg.sender;
        }

        treasury.recoverSWEEP(receiver, SWEEPAmount);
        _burn(receiver, SWEEPERAmount);

        emit SweeperSold(SWEEPAmount);
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    function setSWEEP(address sweepAddress) external onlyOwner {
        require(sweepAddress != address(0), "Zero address detected");

        SWEEP = ISweep(sweepAddress);
        emit SWEEPSet(sweepAddress);
    }

    function setTransferApprover(address approverAddress) external onlyOwner {
        require(approverAddress != address(0), "Zero address detected");

        transferApprover = ITransferApprover(approverAddress);
        emit ApproverSet(approverAddress);
    }

    function setTreasury(address payable treasuryAddress) external onlyOwner {
        require(treasuryAddress != address(0), "Zero address detected");

        treasury = Treasury(treasuryAddress);
        emit TreasurySet(treasuryAddress);
    }

    function setMintBurnAddress(address newMintBurnAddress) external onlyOwner {
        mintBurnAddress = newMintBurnAddress;
        emit mintBurnAddressSet(newMintBurnAddress);
    }

    function setSWEEPERPrice(uint256 newSweeperPrice) external onlyOwner {
        price = newSweeperPrice;

        emit SweeperPriceSet(newSweeperPrice);
    }

    function setAllowMinting(bool _allowMint) external onlyOwner {
        allowMinting = _allowMint;

        emit AllowMintingSet(_allowMint);
    }

    function setAllowBurning(bool _allowBurn) external onlyOwner {
        allowBurning = _allowBurn;

        emit AllowBurningSet(_allowBurn);
    }

    function setTargetTreasury(uint256 newTargetTreasury) external onlyOwner {
        targetTreasury = newTargetTreasury;

        emit TargetTreasurySet(newTargetTreasury);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    /* ========== OVERRIDDEN PUBLIC FUNCTIONS ========== */

    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        whenNotPaused
        override
    {
        require(transferApprover.checkTransfer(from, to) == true, "Transfer is not allowed");
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

    /* ========== EVENTS ========== */

    event SWEEPSet(address sweepAddress);
    event ApproverSet(address approverAddress);
    event TreasurySet(address treasuryAddress);
    event mintBurnAddressSet(address mintBurnAddress);
    event SweeperPriceSet(uint256 price);
    event AllowMintingSet(bool allowMint);
    event AllowBurningSet(bool allowBurn);
    event TargetTreasurySet(uint256 targetTreasury);
    event SweeperBought(uint256 sweeperAmount);
    event SweeperSold(uint256 sweepAmount);

    /* ========== Errors ========== */

    error NotAdmin();
    error GreaterThanTargetTreasury();
    error SmallerThanTargetTreasury();
    error NotMintBurnAddress();
    error MintNotAllowed();
    error BurnNotAllowed();
}
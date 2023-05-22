// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ======================= BaseSweep.sol ==============================
// ====================================================================

import "@layerzerolabs/solidity-examples/contracts/contracts-upgradable/token/oft/OFTUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "./TransferApprover/ITransferApprover.sol";

contract BaseSweep is Initializable, OFTUpgradeable, PausableUpgradeable {
    // Addresses
    address public fast_multisig;

    ITransferApprover private transferApprover;

    // Structs
    struct Minter {
        uint256 max_amount;
        uint256 minted_amount;
        bool is_listed;
        bool is_enabled;
    }

    // Minters
    mapping(address => Minter) public minters;
    // Minter Addresses
    address[] public minter_addresses;

    /* ========== Events ========== */

    event TokenBurned(address indexed from, uint256 amount);
    event TokenMinted(address indexed from, address indexed to, uint256 amount);
    event MinterAdded(address indexed minter_address, Minter minter);
    event MinterUpdated(address indexed minter_address, Minter minter);
    event MinterRemoved(address indexed minter_address);
    event ApproverSet(address indexed approver);

    /* ========== Errors ========== */

    error InvalidMinter();
    error NotGovernance();
    error NotMultisig();
    error ZeroAmountDetected();
    error ZeroAddressDetected();
    error MintDisabled();
    error MintCapReached();
    error ExceedBurnAmount();
    error MinterExist();
    error TransferNotAllowed();

    /* ========== MODIFIERS ========== */

    modifier validMinter(address _addr) {
        if (!minters[_addr].is_listed) revert InvalidMinter();
        _;
    }

    modifier onlyGov() {
        if (msg.sender != owner()) revert NotGovernance();
        _;
    }

    modifier onlyMultisig() {
        if (msg.sender != owner() && msg.sender != fast_multisig)
            revert NotMultisig();
        _;
    }

    /* ========== CONSTRUCTOR ========== */

    function __Sweep_init(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _fast_multisig
    ) public onlyInitializing {
        __OFTUpgradeable_init(_name, _symbol, _lzEndpoint);
        __Pausable_init();

        fast_multisig = _fast_multisig;
    }

    /* ========== VIEWS ========== */

    function isValidMinter(address _minter) external view returns (bool) {
        return minters[_minter].is_listed && minters[_minter].max_amount > 0;
    }

    /* ========== Settings ========== */

    /**
     * @notice Pause Sweep
     */
    function pause() external onlyMultisig whenNotPaused {
        _pause();
    }

    /**
     * @notice Unpause Sweep
     */
    function unpause() external onlyMultisig whenPaused {
        _unpause();
    }

    /**
     * @notice Get Minters
     * @return list of whitelisted minter addresses
     */
    function getMinters() external view returns (address[] memory) {
        return minter_addresses;
    }

    /**
     * @notice Add Minter
     * Adds whitelisted minters.
     * @param _minter Address to be added.
     * @param _amount Max Amount for mint.
     */
    function addMinter(address _minter, uint256 _amount) external onlyGov {
        if (_minter == address(0)) revert ZeroAddressDetected();
        if (_amount == 0) revert ZeroAmountDetected();
        if (minters[_minter].is_listed) revert MinterExist();

        minter_addresses.push(_minter);

        Minter memory new_minter = Minter({
            max_amount: _amount,
            minted_amount: 0,
            is_listed: true,
            is_enabled: true
        });
        minters[_minter] = new_minter;

        emit MinterAdded(_minter, new_minter);
    }

    /**
     * @notice Remove Minter
     * A minter will be removed from the list.
     * @param _minter Address to be removed.
     */
    function removeMinter(
        address _minter
    ) external onlyGov validMinter(_minter) {
        delete minters[_minter]; // Delete minter from the mapping

        for (uint256 i = 0; i < minter_addresses.length; i++) {
            if (minter_addresses[i] == _minter) {
                minter_addresses[i] = minter_addresses[
                    minter_addresses.length - 1
                ];
                minter_addresses.pop();
                break;
            }
        }

        emit MinterRemoved(_minter);
    }

    /**
     * @notice Set Max Amount of a Minter
     * Update the max mint amount of a user.
     * @param _minter Address of a user.
     * @param _amount Max Mint Amount .
     */
    function setMinterMaxAmount(
        address _minter,
        uint256 _amount
    ) external onlyGov validMinter(_minter) {
        minters[_minter].max_amount = _amount;

        emit MinterUpdated(_minter, minters[_minter]);
    }

    /**
     * @notice Minter Enable
     * Enable a user to mint.
     * @param _minter Address of a user.
     * @param _is_enabled True: enabled, False: disabled.
     */
    function setMinterEnabled(
        address _minter,
        bool _is_enabled
    ) external onlyGov validMinter(_minter) {
        minters[_minter].is_enabled = _is_enabled;

        emit MinterUpdated(_minter, minters[_minter]);
    }

    /**
     * @notice Set Transfer Approver
     * @param _approver Address of a Approver.
     */
    function setTransferApprover(address _approver) external onlyGov {
        if (_approver == address(0)) revert ZeroAddressDetected();
        transferApprover = ITransferApprover(_approver);

        emit ApproverSet(_approver);
    }

    /* ========== Actions ========== */

    /**
     * @notice Mint
     * This function is what other minters will call to mint new tokens
     * @param _minter Address of a minter.
     * @param _amount Amount for mint.
     */
    function minter_mint(
        address _minter,
        uint256 _amount
    ) public virtual validMinter(msg.sender) whenNotPaused {
        if (!minters[msg.sender].is_enabled) revert MintDisabled();
        if (
            minters[msg.sender].minted_amount + _amount >
            minters[msg.sender].max_amount
        ) revert MintCapReached();

        minters[msg.sender].minted_amount += _amount;
        super._mint(_minter, _amount);

        emit TokenMinted(msg.sender, _minter, _amount);
    }

    /**
     * @notice Burn
     * Used by minters when user redeems
     * @param _amount Amount for burn.
     */
    function minter_burn_from(
        uint256 _amount
    ) external validMinter(msg.sender) whenNotPaused {
        if (minters[msg.sender].minted_amount < _amount)
            revert ExceedBurnAmount();

        super._burn(msg.sender, _amount);
        minters[msg.sender].minted_amount -= _amount;

        emit TokenBurned(msg.sender, _amount);
    }

    /**
     * @notice Hook that is called before any transfer of Tokens
     * @param _from sender address
     * @param _to beneficiary address
     * @param _amount token amount
     */
    function _beforeTokenTransfer(
        address _from,
        address _to,
        uint256 _amount
    ) internal override whenNotPaused {
        if (
            address(transferApprover) != address(0) &&
            !transferApprover.checkTransfer(_from, _to)
        ) revert TransferNotAllowed();

        super._beforeTokenTransfer(_from, _to, _amount);
    }

    function _debitFrom(
        address _from,
        uint16 _dstChainId,
        bytes memory _toAddress,
        uint _amount
    ) internal override returns (uint) {
        address toAddress;
        assembly {
            toAddress := mload(add(_toAddress, 20))
        }

        if (
            address(transferApprover) != address(0) &&
            !transferApprover.checkTransfer(_from, toAddress)
        ) revert TransferNotAllowed();

        super._debitFrom(_from, _dstChainId, _toAddress, _amount);
        return _amount;
    }

    function _creditTo(
        uint16 _srcChainId,
        address _toAddress,
        uint _amount
    ) internal override returns (uint) {
        if (
            address(transferApprover) != address(0) &&
            !transferApprover.checkTransfer(_toAddress, _toAddress)
        ) revert TransferNotAllowed();

        super._creditTo(_srcChainId, _toAddress, _amount);
        return _amount;
    }
}

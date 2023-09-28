// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@layerzerolabs/solidity-examples/contracts/lzApp/LzApp.sol";

/// @title Omnichain Governance Proposal Sender
/// @notice Sends a proposal's data to remote chains for execution after the proposal passes on the main chain
/// @dev When used with GovernorBravo the owner of this contract must be set to the Timelock contract
contract OmnichainProposalSender is LzApp {

    /// @notice Emitted when a proposal execution request sent to the remote chain
    event ExecuteRemoteProposal(uint16 indexed remoteChainId, bytes payload);

    constructor(address endpoint) LzApp(endpoint) {}

    /// @notice Estimates LayerZero fees for cross-chain message delivery to the remote chain
    /// @dev The estimated fees are the minimum required,
    /// it's recommended to increase the fees amount when sending a message. The unused amount will be refunded
    /// @param remoteChainId The LayerZero id of a remote chain
    /// @param payload The payload to be sent to the remote chain.
    /// It's computed as follows payload = abi.encode(targets, values, signatures, calldatas)
    /// @param adapterParams The params used to specify the custom amount of gas required for the execution on the destination
    /// @return nativeFee The amount of fee in the native gas token (e.g. ETH)
    /// @return zroFee The amount of fee in ZRO token
    function estimateFees(
        uint16 remoteChainId,
        bytes calldata payload,
        bytes calldata adapterParams
    ) external view returns (uint nativeFee, uint zroFee) {
        return lzEndpoint.estimateFees(remoteChainId, address(this), payload, false, adapterParams);
    }

    /// @notice Sends a message to execute a remote proposal
    /// @dev Stores the hash of the execution parameters if sending fails (e.g., due to insufficient fees)
    /// @param remoteChainId The LayerZero id of the remote chain
    /// @param zroPaymentAddress the address of the ZRO token holder who would pay for the transaction
    /// @param payload The payload to be sent to the remote chain.
    /// It's computed as follows payload = abi.encode(targets, values, signatures, calldatas)
    /// @param adapterParams The params used to specify the custom amount of gas required
    /// for the execution on the destination
    function execute(
        uint16 remoteChainId,
        address zroPaymentAddress,
        bytes calldata payload,
        bytes calldata adapterParams
    ) external payable onlyOwner {
        _lzSend(remoteChainId, payload, payable(tx.origin), zroPaymentAddress, adapterParams, msg.value);
        emit ExecuteRemoteProposal(remoteChainId, payload);
    }

    function _blockingLzReceive(
        uint16 srcChainId,
        bytes memory srcAddress,
        uint64 nonce,
        bytes memory payload
    ) internal virtual override {}
}
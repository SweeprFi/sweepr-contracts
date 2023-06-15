// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

// ==========================================================
// ======================= Owned.sol ========================
// ==========================================================

import "../Sweep/ISweep.sol";

contract Owned {
    address public immutable sweepAddress;
    ISweep public immutable SWEEP;

    // Errors
    error NotGovernance();
    error NotMultisig();
    error NotGovOrMultisig();
    error ZeroAddressDetected();

    constructor(address sweepAddress_) {
        if(sweepAddress_ == address(0)) revert ZeroAddressDetected();

        sweepAddress = sweepAddress_;
        SWEEP = ISweep(sweepAddress);
    }

    modifier onlyGov() {
        if (msg.sender != SWEEP.owner()) revert NotGovernance();
        _;
    }

    modifier onlyMultisig() {
        if (msg.sender != SWEEP.fastMultisig())
            revert NotMultisig();
        _;
    }

    modifier onlyGovOrMultisig() {
        if (msg.sender != SWEEP.fastMultisig() && msg.sender != SWEEP.owner())
            revert NotGovOrMultisig();
        _;
    }
}

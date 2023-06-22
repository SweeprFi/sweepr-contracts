// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface ITransferApprover {
    function checkTransfer(
        address from,
        address to
    ) external view returns (bool);
}

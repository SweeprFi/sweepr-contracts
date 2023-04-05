// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.16;

interface ITransferApprover {
    function checkTransfer(address _from, address _to)
        external
        view
        returns (bool);
}
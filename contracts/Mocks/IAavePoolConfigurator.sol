// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IAavePoolConfigurator {
    function setReservePause(address asset, bool paused) external;

    function setReserveFreeze(address asset, bool freeze) external;
}

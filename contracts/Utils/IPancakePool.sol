// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

interface IPancakePool {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint32 feeProtocol,
            bool unlocked
        );

    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;
}

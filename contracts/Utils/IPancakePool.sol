// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.0;

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

    function fee() external view returns (uint24);

    function tickSpacing() external view returns (int24);

    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;
}

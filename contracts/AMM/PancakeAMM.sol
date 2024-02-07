// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ==========================================================
// ====================== PancakeAMM.sol ====================
// ==========================================================

/**
 * @title Pancake AMM
 * @dev Interactions with PancakeSwap
 */

import { UniswapAMM } from "./UniswapAMM.sol";

contract PancakeAMM is UniswapAMM {

    constructor(
        address _sweep,
        address _base,
        address _sequencer,
        address _pool,
        address _oracleBase,
        uint256 _oracleBaseUpdateFrequency,
        address _pancakeLiquidityHelper,
        address _router
    ) UniswapAMM(
        _sweep, _base, _sequencer, _pool, _oracleBase,
        _oracleBaseUpdateFrequency, _pancakeLiquidityHelper, _router
    ) {}

}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ==========================================================
// ====================== BaseswapAMM.sol ===================
// ==========================================================

/**
 * @title Baseswap AMM
 * @dev Interactions with BaseSwap
 */

import "./UniswapAMM.sol";

contract BaseswapAMM is UniswapAMM {

    constructor(
        address _sweep,
        address _base,
        address _sequencer,
        address _pool,
        address _oracleBase,
        uint256 _oracleBaseUpdateFrequency,
        address _liquidityHelper,
        address _router
    ) UniswapAMM(
        _sweep, _base, _sequencer, _pool, _oracleBase,
        _oracleBaseUpdateFrequency, _liquidityHelper, _router
    ) {}
}

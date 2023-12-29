// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

// ====================================================================
// ====================== RatesOracle.sol =============================
// ====================================================================

import { ISweep } from "../Sweep/ISweep.sol";

contract RatesOracle {

    ISweep public immutable sweep;

    constructor(address _sweep) {
        sweep = ISweep(_sweep);
    }

    function sweepPrice() public view returns (uint256) {
        return sweep.targetPrice() * 1e12;
    }

    function getRate() public view returns (uint256) {
        return sweep.targetPrice() * 1e12;
    }
}

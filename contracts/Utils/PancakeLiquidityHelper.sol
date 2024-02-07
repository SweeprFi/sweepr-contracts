// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

// ====================================================================
// =================== PancakeLiquidityHelper.sol =====================
// ====================================================================

import { IPancakePool } from "./IPancakePool.sol";
import { LiquidityHelper } from "./LiquidityHelper.sol";

contract PancakeLiquidityHelper is LiquidityHelper{

    constructor(address _nfpm) LiquidityHelper(_nfpm) {}

    function _slot0(address pool)
        internal view override returns (uint160 sqrtPriceX96, int24 tickCurrent) {
        (sqrtPriceX96, tickCurrent, , , , , ) = IPancakePool(pool).slot0();
    }
}

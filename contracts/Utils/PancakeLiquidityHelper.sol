// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.0;

// ====================================================================
// =================== PancakeLiquidityHelper.sol =====================
// ====================================================================

import "./IPancakePool.sol";
import "./LiquidityHelper.sol";

contract PancakeLiquidityHelper is LiquidityHelper{

    constructor(address _positionManager)
    LiquidityHelper(_positionManager) {}

    // *********** Override
    function _getCurrentTick(address poolAddress) internal view override returns (int24 tickCurrent) {
        IPancakePool pool = IPancakePool(poolAddress);
        (, tickCurrent, , , , , ) = pool.slot0();
    }

    function _getPriceAndTick(address poolAddress) internal view override returns (uint160 sqrtPriceX96, int24 tickCurrent) {
        IPancakePool pool = IPancakePool(poolAddress);
        (sqrtPriceX96, tickCurrent, , , , , ) = pool.slot0();
    }
}

// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

// ====================================================================
// ====================== LiquidityHelper.sol =========================
// ====================================================================

import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import "@uniswap/v3-core/contracts/libraries/SqrtPriceMath.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";

contract LiquidityHelper {
    INonfungiblePositionManager internal immutable nfpm;

    constructor(address _nfpm) {
        nfpm = INonfungiblePositionManager(_nfpm);
    }

    function _slot0(address pool)
        internal view virtual returns (uint160 sqrtPriceX96, int24 tickCurrent)
    {
        (sqrtPriceX96, tickCurrent, , , , , ) = IUniswapV3Pool(pool).slot0();
    }

    function getTokenAmountsFromLP(
        uint256 tokenId,
        address pool
    ) external view returns (uint256 amount0, uint256 amount1) {
        (uint160 sqrtPriceX96, int24 tickCurrent) = _slot0(pool);
        (,,,,, int24 tickLower, int24 tickUpper, uint128 liquidity,,,,) = nfpm.positions(tokenId);

        if (tickCurrent < tickLower) {
            amount0 = SqrtPriceMath.getAmount0Delta(
                TickMath.getSqrtRatioAtTick(tickLower),
                TickMath.getSqrtRatioAtTick(tickUpper),
                liquidity,
                true
            );
            amount1 = 0;
        } else if (tickCurrent < tickUpper) {
            amount0 = SqrtPriceMath.getAmount0Delta(
                sqrtPriceX96,
                TickMath.getSqrtRatioAtTick(tickUpper),
                liquidity,
                true
            );
            amount1 = SqrtPriceMath.getAmount1Delta(
                TickMath.getSqrtRatioAtTick(tickLower),
                sqrtPriceX96,
                liquidity,
                true
            );
        } else {
            amount0 = 0;
            amount1 = SqrtPriceMath.getAmount1Delta(
                TickMath.getSqrtRatioAtTick(tickLower),
                TickMath.getSqrtRatioAtTick(tickUpper),
                liquidity,
                true
            );
        }
    }

    function getTickFromPrice(
        uint256 price,
        uint256 decimal,
        int24 tickSpacing,
        bool flag
    ) external pure returns (int24 tick) {
        int128 value1 = ABDKMath64x64.fromUInt(10 ** decimal);
        int128 value2 = ABDKMath64x64.fromUInt(price);
        int128 value = ABDKMath64x64.div(value2, value1);
        if (flag) {
            value = ABDKMath64x64.div(value1, value2);
        }
        tick = TickMath.getTickAtSqrtRatio(uint160(int160(ABDKMath64x64.sqrt(value) << (FixedPoint96.RESOLUTION - 64))));
        tick = (tick / tickSpacing) * tickSpacing;
    }

    function getCurrentTick(address pool) external view returns (int24 tickCurrent) {
        (, tickCurrent) = _slot0(pool);
    }

}

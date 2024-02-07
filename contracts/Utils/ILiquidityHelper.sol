// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

interface ILiquidityHelper {

    function getTokenAmountsFromLP(uint256 tokenId, address pool) external view returns (uint256 amount0, uint256 amount1);

    function getTickFromPrice(uint256 price, uint256 decimal, int24 tickSpacing, bool flag) external pure returns (int24 tick);

    function getCurrentTick(address pool) external view returns (int24 tickCurrent);

}

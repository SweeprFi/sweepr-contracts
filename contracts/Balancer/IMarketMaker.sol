// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IMarketMaker {
    function getBuyPrice() external view returns (uint256 price);

    function buySweep(
        uint256 usdxAmount,
        uint256 sweepAmount,
        uint256 usdxMinIn,
        uint256 sweepMinIn,
        uint256 slippage
    ) external;
}

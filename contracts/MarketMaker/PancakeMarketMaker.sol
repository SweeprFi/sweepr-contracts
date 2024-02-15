// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ===================== PancakeMarketMaker.sol =======================
// ====================================================================

/**
 * @title Pancake Market Maker
 * @dev Implementation:
 * Mints a new LP.
 * Increases and decreases the liquidity for the LP created.
 * Collects fees from the LP.
 */

import { UniswapMarketMaker } from "./UniswapMarketMaker.sol";

contract PancakeMarketMaker is UniswapMarketMaker {

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _oracleUsdx,
        address _positionManager,
        address _borrower
    ) UniswapMarketMaker(_name, _sweep, _usdx, _oracleUsdx, _positionManager, _borrower) {}
}

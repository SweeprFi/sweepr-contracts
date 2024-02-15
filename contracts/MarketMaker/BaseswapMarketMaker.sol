// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ===================== BaseswapMarketMaker.sol ======================
// ====================================================================

/**
 * @title Baseswap Market Maker
 * @dev Implementation:
 * Mints a new LP.
 * Increases and decreases the liquidity for the LP created.
 * Collects fees from the LP.
 */

import { UniswapMarketMaker } from "./UniswapMarketMaker.sol";

contract BaseswapMarketMaker is UniswapMarketMaker {

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _oracleUsdx,
        address _positionManager,
        address _borrower
    ) UniswapMarketMaker(_name, _sweep, _usdx, _oracleUsdx, _positionManager, _borrower) {}
}

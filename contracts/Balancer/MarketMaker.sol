// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= MarketMaker.sol ========================
// ====================================================================

/**
 * @title MarketMaker
 * @dev Implementation:
 Simple marketmaker (buy & sell SWEEP)
 AMM marketmaker (single-sided liquidity)
 */

import "../Stabilizer/Stabilizer.sol";
import "../Utils/LiquidityHelper.sol";
import "../Oracle/UniswapOracle.sol";

contract MarketMaker is Stabilizer {
    // Details about position
    struct Position {
        uint256 token_id;
        uint128 liquidity;
        int24 tick_lower;
        int24 tick_upper;
        uint24 fee_tier;
        uint256 token0_amount;
        uint256 token1_amount;
    }

    // Array of all Uni v3 NFT positions held by MarketMaker
    Position[] public positions_array;

    // Map token_id to Position
    mapping(uint256 => Position) public positions_mapping;

    address public token0;
    address public token1;
    bool private immutable flag; // The sort status of tokens

    // Uniswap V3 Position Manager
    INonfungiblePositionManager public constant nonfungiblePositionManager =
        INonfungiblePositionManager(0xC36442b4a4522E871399CD717aBDD847Ab11FE88);
    LiquidityHelper private immutable liquidityHelper;

    // Variables
    uint256 public top_spread;
    uint256 public bottom_spread;

    // Constants
    uint24 private constant PRECISION = 1e6;

    // Events
    event Minted(uint256 tokenId, uint128 liquidity);
    event Burned(uint256 tokenId);

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _liquidityHelper,
        address _amm_address,
        address _borrower,
        uint256 _top_spread,
        uint256 _bottom_spread
    )
        Stabilizer(
            _name,
            _sweep_address,
            _usdx_address,
            _amm_address,
            _borrower
        )
    {
        flag = _usdx_address < _sweep_address;

        (token0, token1) = flag
            ? (_usdx_address, _sweep_address)
            : (_sweep_address, _usdx_address);

        liquidityHelper = LiquidityHelper(_liquidityHelper);

        min_equity_ratio = 0;

        top_spread = _top_spread;
        bottom_spread = _bottom_spread;
    }

    /* ========== Simple Marketmaker Actions ========== */

    /**
     * @notice Execute operation to peg to target price of SWEEP.
     */
    function execute(uint256 _sweep_amount) public onlyBorrower {
        uint256 arb_price_upper = ((PRECISION + top_spread) * SWEEP.target_price()) / PRECISION;
        uint256 arb_price_lower = ((PRECISION - bottom_spread) * SWEEP.target_price()) / PRECISION;

        (uint256 usdc_balance, ) = _balances();

        if (SWEEP.amm_price() < arb_price_lower && usdc_balance > 0) {
            buySweep(_sweep_amount);
        }

        if (SWEEP.amm_price() > arb_price_upper) {
            sellSweep(_sweep_amount);
        }
    }

    /**
     * @notice Sell Sweep.
     * @param _sweep_amount to sell.
     */
    function sellSweep(uint256 _sweep_amount) internal {
        uint256 sweep_limit = SWEEP.minters(address(this)).max_amount;
        uint256 sweep_available = sweep_limit - sweep_borrowed;
        _sweep_amount = _min(_sweep_amount, sweep_available);

        _borrow(_sweep_amount);
        _sell(_sweep_amount, 0);
    }

    /**
     * @notice Buy Sweep.
     * @param _sweep_amount to buy.
     */
    function buySweep(uint256 _sweep_amount) internal {
        (uint256 usdx_balance, ) = _balances();

        uint256 usdc_amount = SWEEP.convertToUSD(_sweep_amount);
        usdc_amount = _min(usdc_amount, usdx_balance);

        uint256 sweep_amount = _buy(usdc_amount, 0);
        _repay(sweep_amount);
    }

    /**
     * @notice Update top_spread.
     * @param _top_spread new top_spread.
     */
    function setTopSpread(
        uint256 _top_spread
    ) external onlyBorrower onlySettingsEnabled {
        top_spread = _top_spread;
    }

    /**
     * @notice Update bottom_spread.
     * @param _bottom_spread new bottom_spread.
     */
    function setBottomSpread(
        uint256 _bottom_spread
    ) external onlyBorrower onlySettingsEnabled {
        bottom_spread = _bottom_spread;
    }

    /* ============ AMM Marketmaker Actions =========== */

    /**
     * @notice Add single-sided liquidity
     * @param _min_price minimum price
     * @param _max_price maximum price
     * @param _usdx_amount usdx amount to mint
     * @param _sweep_amount sweep amount to mint
     */
    function addSinglLiquidity(
        uint256 _min_price, 
        uint256 _max_price, 
        uint256 _usdx_amount, 
        uint256 _sweep_amount
    ) public onlyBorrower {
        // Make sure one of token pair should be zero amount
        require(_usdx_amount == 0 || _sweep_amount == 0, "not one token");

        (uint256 usdx_balance, uint256 sweep_balance) = _balances();
        _usdx_amount = _min(_usdx_amount, usdx_balance);
        _sweep_amount = _min(_sweep_amount, sweep_balance);

        // Check market maker has enough balance to mint
        require(_usdx_amount > 0 || _sweep_amount > 0, "not enough balance");
        
        TransferHelper.safeApprove(
            address(usdx),
            address(nonfungiblePositionManager),
            _usdx_amount
        );

        TransferHelper.safeApprove(
            sweep_address,
            address(nonfungiblePositionManager),
            _sweep_amount
        );

        (int24 min_tick, int24 max_tick) = getTicks(_min_price, _max_price);

        (uint256 amount0_mint, uint256 amount1_mint) = flag
            ? (_usdx_amount, _sweep_amount)
            : (_sweep_amount, _usdx_amount);

        (uint256 tokenId, uint128 amount_liquidity, uint256 amount0, uint256 amount1) = nonfungiblePositionManager
            .mint(
                INonfungiblePositionManager.MintParams({
                    token0: token0,
                    token1: token1,
                    fee: amm.poolFee(),
                    tickLower: min_tick,
                    tickUpper: max_tick,
                    amount0Desired: amount0_mint,
                    amount1Desired: amount1_mint,
                    amount0Min: 0,
                    amount1Min: 0,
                    recipient: address(this),
                    deadline: block.timestamp
                })
            );

        Position memory pos = Position(
            tokenId,
            amount_liquidity,
            min_tick,
            max_tick,
            amm.poolFee(),
            amount0,
            amount1
        );

        positions_array.push(pos);
        positions_mapping[tokenId] = pos;

        emit Minted(tokenId, amount_liquidity);
    }

    /**
     * @notice Remove out-of-range poisitions
     */
    function removeOutOfPositions() external onlyBorrower {
        for (uint i = 0; i < positions_array.length; i++) {
            int24 tick_current = liquidityHelper.getCurrentTick(token0, token1, amm.poolFee());
            Position memory position = positions_array[i];

            // check to see if current tick is out of range
            if (tick_current < position.tick_lower || position.tick_upper < tick_current) {
                removeLiquidity(i);
            }
        }
    }

    /**
     * @notice Remove liquidity
     * @param _index position index
     */
    function removeLiquidity(uint256 _index) public onlyBorrower {
        Position memory position = positions_array[_index];

        (uint256 d_amount0, uint256 d_amount1) = nonfungiblePositionManager.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: position.token_id,
                liquidity: position.liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            })
        );

        (uint256 c_amount0, uint256 c_amount1) = nonfungiblePositionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: position.token_id,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        // repay amount
        uint256 sweep_amount;

        if (token0 == address(SWEEP)) {
            sweep_amount = c_amount0 + d_amount0;
        } else {
            sweep_amount = c_amount1 + d_amount1;
        }

        _repay(sweep_amount);

        nonfungiblePositionManager.burn(position.token_id);

        positions_array[_index] = positions_array[positions_array.length -1];
        positions_array.pop();
        delete positions_mapping[position.token_id];

        emit Burned(position.token_id);
    }

    /**
     * @notice Get the ticks from price range
     * @return minTick The minimum tick
     * @return maxTick The maximum tick
     */
    function getTicks(uint256 _min_price, uint256 _max_price) internal view returns (int24 minTick, int24 maxTick) {
        int24 tick_spacing = liquidityHelper.getTickSpacing(token0, token1, amm.poolFee());
        uint8 decimals = SWEEP.decimals();

        minTick = liquidityHelper.getTickFromPrice(
            _min_price,
            decimals,
            tick_spacing,
            flag
        );

        maxTick = liquidityHelper.getTickFromPrice(
            _max_price,
            decimals,
            tick_spacing,
            flag
        );

        (minTick, maxTick) = minTick < maxTick
            ? (minTick, maxTick)
            : (maxTick, minTick);
    }

    /**
     * @notice Counts positions
    */
    function numPositions() external view returns (uint256) {
        return positions_array.length;
    }
}

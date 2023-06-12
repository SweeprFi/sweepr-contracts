// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= MarketMaker.sol ========================
// ====================================================================

/**
 * @title MarketMaker
 * @dev Implementation:
Borrow SWEEP, exchange USDC and place it into a Uniswap V3 AMM as single-sided liquidity
Remove any LP positions that are converted to SWEEP, and repay it
*/

import "../Utils/LiquidityHelper.sol";
import "../Stabilizer/Stabilizer.sol";

contract MarketMaker is Stabilizer {
    // Uniswap V3 Position Manager
    INonfungiblePositionManager public constant nonfungiblePositionManager =
        INonfungiblePositionManager(0xC36442b4a4522E871399CD717aBDD847Ab11FE88);
    LiquidityHelper private immutable liquidityHelper;

    // Details about position
    struct Position {
        uint128 liquidity;
        int24 tickLower;
        int24 tickUpper;
        uint24 fee;
        uint256 token0Amount;
        uint256 token1Amount;
    }

    uint256[] public positionIds;
    uint256[] private removeIds;

    // Map tokenId to Position
    mapping(uint256 => Position) public positions;

    address public token0;
    address public token1;
    bool private immutable flag; // The sort status of tokens

    // Spread Variables
    uint256 public topSpread;
    uint256 public bottomSpread;
    uint256 public tickSpread;

    // Constants
    uint24 private constant PRECISION = 1e6;

    // Events
    event Minted(uint256 tokenId, uint128 liquidity);
    event Burned(uint256 tokenId);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _liquidityHelper,
        address _borrower,
        uint256 _topSpread,
        uint256 _bottomSpread,
        uint256 _tickSpread
    ) Stabilizer(_name, _sweep, _usdx, _borrower) {
        flag = _usdx < _sweep;
        (token0, token1) = flag ? (_usdx, _sweep) : (_sweep, _usdx);
        liquidityHelper = LiquidityHelper(_liquidityHelper);
        min_equity_ratio = 0;
        topSpread = _topSpread;
        bottomSpread = _bottomSpread;
        tickSpread = _tickSpread;
    }

    /* ========== Simple Marketmaker Actions ========== */

    /**
     * @notice Execute operation to peg to target price of SWEEP.
     */
    function execute(uint256 _sweepAmount) external {
        uint256 targetPrice = SWEEP.target_price();
        uint256 arbPriceUpper = ((PRECISION + topSpread) * targetPrice) /
            PRECISION;
        uint256 arbPriceLower = ((PRECISION - bottomSpread) * targetPrice) /
            PRECISION;
        uint24 poolFee = amm().poolFee();

        if (SWEEP.amm_price() > arbPriceUpper && _sweepAmount > 0) {
            uint256 usdxAmount = sellSweep(_sweepAmount);
            uint256 minPrice = ((PRECISION - tickSpread) * targetPrice) /
                PRECISION;
            uint256 maxPrice = targetPrice;
            addSingleLiquidity(minPrice, maxPrice, usdxAmount, poolFee);
        }

        if (SWEEP.amm_price() < arbPriceLower && _sweepAmount == 0) {
            removeOutOfPositions(poolFee);
        }
    }

    /**
     * @notice Sell Sweep.
     * @param _sweepAmount to sell.
     */
    function sellSweep(
        uint256 _sweepAmount
    ) internal returns (uint256 usdxAmount) {
        uint256 sweepLimit = SWEEP.minters(address(this)).max_amount;
        uint256 sweepAvailable = sweepLimit - sweep_borrowed;
        if (_sweepAmount > sweepAvailable) _sweepAmount = sweepAvailable;

        // calculate usdx minimum amount for swap
        uint256 minAmountUSD = SWEEP.convertToUSD(_sweepAmount);
        uint256 minAmountUSDx = amm().USDtoToken(minAmountUSD);

        _borrow(_sweepAmount);
        usdxAmount = _sell(_sweepAmount, minAmountUSDx);
    }

    /**
     * @notice Update topSpread.
     * @param _topSpread new topSpread.
     */
    function setTopSpread(
        uint256 _topSpread
    ) external onlyBorrower onlySettingsEnabled {
        topSpread = _topSpread;
    }

    /**
     * @notice Update bottomSpread.
     * @param _bottomSpread new bottomSpread.
     */
    function setBottomSpread(
        uint256 _bottomSpread
    ) external onlyBorrower onlySettingsEnabled {
        bottomSpread = _bottomSpread;
    }

    /**
     * @notice Update tickSpread.
     * @param _tickSpread new tickSpread.
     */
    function setTickSpread(
        uint256 _tickSpread
    ) external onlyBorrower onlySettingsEnabled {
        tickSpread = _tickSpread;
    }

    /* ============ AMM Marketmaker Actions =========== */

    /**
     * @notice Add single-sided liquidity
     * @param _minPrice minimum price
     * @param _maxPrice maximum price
     * @param _usdxAmount usdx amount to mint
     * @param _poolFee pool fee
     */
    function addSingleLiquidity(
        uint256 _minPrice,
        uint256 _maxPrice,
        uint256 _usdxAmount,
        uint24 _poolFee
    ) internal {
        uint256 _sweepAmount;
        (uint256 usdxBalance, ) = _balances();
        if (_usdxAmount > usdxBalance) _usdxAmount = usdxBalance;

        // Check market maker has enough balance to mint
        if (_usdxAmount == 0) revert NotEnoughBalance();

        TransferHelper.safeApprove(
            address(usdx),
            address(nonfungiblePositionManager),
            _usdxAmount
        );

        (int24 minTick, int24 maxTick) = getTicks(
            _minPrice,
            _maxPrice,
            _poolFee
        );

        (uint256 amount0Mint, uint256 amount1Mint) = flag
            ? (_usdxAmount, _sweepAmount)
            : (_sweepAmount, _usdxAmount);

        (
            uint256 tokenId,
            uint128 amountLiquidity,
            uint256 amount0,
            uint256 amount1
        ) = nonfungiblePositionManager.mint(
                INonfungiblePositionManager.MintParams({
                    token0: token0,
                    token1: token1,
                    fee: _poolFee,
                    tickLower: minTick,
                    tickUpper: maxTick,
                    amount0Desired: amount0Mint,
                    amount1Desired: amount1Mint,
                    amount0Min: 0,
                    amount1Min: 0,
                    recipient: address(this),
                    deadline: block.timestamp
                })
            );

        Position memory pos = Position(
            amountLiquidity,
            minTick,
            maxTick,
            _poolFee,
            amount0,
            amount1
        );

        positionIds.push(tokenId);
        positions[tokenId] = pos;

        emit Minted(tokenId, amountLiquidity);
    }

    /**
     * @notice Remove out-of-range poisitions
     */
    function removeOutOfPositions(uint24 _poolFee) internal {
        uint256 len = positionIds.length;

        for (uint256 i = 0; i < len; ) {
            int24 tickCurrent = liquidityHelper.getCurrentTick(
                token0,
                token1,
                _poolFee
            );
            uint256 tokenId = positionIds[i];
            Position memory position = positions[tokenId];

            // check to see if current tick is out of i-th position's range.
            // it means all usdc were sold out and only sweep are left.
            // At this time, we need to check tick direction.
            if (
                (!flag && tickCurrent < position.tickLower) ||
                (flag && tickCurrent > position.tickUpper)
            ) {
                removeLiquidity(i);
                removeIds.push(i);
            }
            unchecked {
                ++i;
            }
        }

        // Remove position ids
        for (uint256 i = removeIds.length; i > 0; ) {
            uint256 _index = removeIds[i - 1];
            positionIds[_index] = positionIds[positionIds.length - 1];
            positionIds.pop();

            unchecked {
                --i;
            }
        }
        delete removeIds;
    }

    /**
     * @notice Remove liquidity
     * @param _index position index
     */
    function removeLiquidity(uint256 _index) internal {
        uint256 tokenId = positionIds[_index];

        Position memory position = positions[tokenId];
        (uint256 dAmount0, uint256 dAmount1) = nonfungiblePositionManager
            .decreaseLiquidity(
                INonfungiblePositionManager.DecreaseLiquidityParams({
                    tokenId: tokenId,
                    liquidity: position.liquidity,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp
                })
            );

        (uint256 cAmount0, uint256 cAmount1) = nonfungiblePositionManager
            .collect(
                INonfungiblePositionManager.CollectParams({
                    tokenId: tokenId,
                    recipient: address(this),
                    amount0Max: type(uint128).max,
                    amount1Max: type(uint128).max
                })
            );

        // repay amount
        uint256 sweepAmount;

        if (token0 == address(SWEEP)) {
            sweepAmount = cAmount0 + dAmount0;
        } else {
            sweepAmount = cAmount1 + dAmount1;
        }

        _repay(sweepAmount);

        nonfungiblePositionManager.burn(tokenId);

        delete positions[tokenId];

        emit Burned(tokenId);
    }

    /**
     * @notice Get the ticks from price range
     * @return minTick The minimum tick
     * @return maxTick The maximum tick
     */
    function getTicks(
        uint256 _minPrice,
        uint256 _maxPrice,
        uint24 _poolFee
    ) internal view returns (int24 minTick, int24 maxTick) {
        int24 tickSpacing = liquidityHelper.getTickSpacing(
            token0,
            token1,
            _poolFee
        );
        uint8 decimals = SWEEP.decimals();

        minTick = liquidityHelper.getTickFromPrice(
            _minPrice,
            decimals,
            tickSpacing,
            flag
        );

        maxTick = liquidityHelper.getTickFromPrice(
            _maxPrice,
            decimals,
            tickSpacing,
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
        return positionIds.length;
    }
}

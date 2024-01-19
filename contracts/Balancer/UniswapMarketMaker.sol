// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ===================== UniswapMarketMaker.sol =======================
// ====================================================================

/**
 * @title Uniswap Market Maker
 * @dev Implementation:
 * Mints a new LP.
 * Increases and decreases the liquidity for the LP created.
 * Collects fees from the LP.
 */

import "../Utils/LiquidityHelper.sol";
import "../Stabilizer/Stabilizer.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract UniswapMarketMaker is IERC721Receiver, Stabilizer {
    // Uniswap V3 Position Manager
    INonfungiblePositionManager public constant nonfungiblePositionManager =
        INonfungiblePositionManager(0xC36442b4a4522E871399CD717aBDD847Ab11FE88);
    LiquidityHelper private immutable liquidityHelper;

    // Variables
    address public token0;
    address public token1;
    bool private immutable flag; // The sort status of tokens
    int24 public constant TICK_SPACE = 10; // TICK_SPACE are 10, 60, 200
    uint256 private constant PRECISION = 1e6;
    uint256 public tradePosition;
    uint256 public growPosition;
    uint256 public redeemPosition;
    uint32 public slippage; 

    // Errors
    error NotMinted();
    error AlreadyMinted();
    error OnlyPositionManager();
    error BadSlippage();

    event Collected(uint256 amount0, uint256 amount1);
    event LiquidityAdded(uint256 usdxAmount, uint256 sweepAmount);
    event SweepPurchased(uint256 sweeAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _liquidityHelper,
        address _oracleUsdx,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        slippage = 5000; // 0.5%
        flag = _usdx < _sweep;
        (token0, token1) = flag ? (_usdx, _sweep) : (_sweep, _usdx);
        liquidityHelper = LiquidityHelper(_liquidityHelper);
    }

    /* ========== Views ========== */
    function tradeLiquidity() external view returns (uint128) {
        return _getLiquidity(tradePosition);
    }

    function growLiquidity() external view returns (uint128) {
        return _getLiquidity(growPosition);
    }

    function redeemLiquidity() external view returns (uint128) {
        return _getLiquidity(redeemPosition);
    }

    /**
    /**
     * @notice Gets the asset price of AMM
     * @return the amm usdx amount
     */
    function assetValue() public view override returns (uint256) {
        uint256 usdxAmount;
        uint256 sweepAmount;
        if (tradePosition > 0) {
            (uint256 amount0, uint256 amount1,) = amm().getPositions(tradePosition);
            usdxAmount += amount0;
            sweepAmount += amount1;
        }

        if (growPosition > 0) {
            (uint256 amount0, uint256 amount1,) = amm().getPositions(growPosition);
            usdxAmount += amount0;
            sweepAmount += amount1;
        }

        if (redeemPosition > 0) {
            (uint256 amount0, uint256 amount1,) = amm().getPositions(redeemPosition);
            usdxAmount += amount0;
            sweepAmount += amount1;
        }

        return _oracleUsdxToUsd(usdxAmount) + sweep.convertToUSD(sweepAmount);
    }

    function getBuyPrice() public view returns (uint256) {
        uint256 targetPrice = sweep.targetPrice();
        return targetPrice + ((sweep.arbSpread() * targetPrice) / PRECISION);
    }

    /* ========== Actions ========== */
    function setSlippage(uint32 newSlippage) external nonReentrant onlyBorrower {
        if(newSlippage > PRECISION) revert BadSlippage();
        slippage = newSlippage;
    }

    /**
     * @notice Collects the fees associated with provided liquidity
     * @dev The contract must hold the erc721 token before it can collect fees
     */
    function collectFees(uint256 position) external onlyBorrower whenNotPaused nonReentrant {
        _collect(position);
    }

    /**
     * @notice Implementing `onERC721Received` so this contract can receive custody of erc721 tokens
     */
    function onERC721Received(address, address, uint256 _tokenId, bytes calldata) external override returns (bytes4) {
        if (msg.sender != address(nonfungiblePositionManager))
            revert OnlyPositionManager();
        if (tradePosition > 0) revert AlreadyMinted();
        tradePosition = _tokenId;

        return this.onERC721Received.selector;
    }

    /**
     * @notice Burn trade NFT
     */
    function burnTradePosition() external onlyBorrower nonReentrant {
        if(tradePosition == 0) revert NotMinted();
        _removePosition(tradePosition);
        tradePosition = 0;
    }

    /**
     * @notice Burn redeem NFT
     */
    function burnRedeemPosition() external onlyBorrower nonReentrant {
        if(redeemPosition == 0) revert NotMinted();
        _removePosition(redeemPosition);
        redeemPosition = 0;
    }

    /**
     * @notice Burn grow NFT
     */
    function burnGrowPosition() external onlyBorrower nonReentrant {
        if(growPosition == 0) revert NotMinted();
        _removePosition(growPosition);
        growPosition = 0;
    }

    /**
     * @notice A function that decreases the current liquidity.
     * @param liquidityAmount Liquidity Amount to decrease
     */
    function removeLiquidity(
        uint256 tokenId,
        uint256 liquidityAmount,
        uint256 amountOut0,
        uint256 amountOut1
    )
        external onlyBorrower nonReentrant validAmount(liquidityAmount)
    {
        nonfungiblePositionManager.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: uint128(liquidityAmount),
                amount0Min: amountOut0,
                amount1Min: amountOut1,
                deadline: block.timestamp
            })
        );
        _collect(tokenId);
    }

    /**
     * @notice Increases liquidity in the current range
     * @dev Pool must be initialized already to add liquidity
     * @param usdxAmount USDX Amount of asset to be deposited
     * @param sweepAmount Sweep Amount of asset to be deposited
     * @param usdxMinIn Min USDX amount to be used for liquidity.
     * @param sweepMinIn Min Sweep amount to be used for liquidity.
     */
    function lpTrade(uint256 usdxAmount, uint256 sweepAmount, uint256 usdxMinIn, uint256 sweepMinIn, uint256 spread)
        external onlyBorrower whenNotPaused nonReentrant
    {
        address self = address(this);
        if(tradePosition > 0) _removePosition(tradePosition);
        (uint256 usdxBalance, uint256 sweepBalance) = _balances();

        if(sweepAmount > sweepBalance) {
            if (sweep.isMintingAllowed()) {
                _borrow(sweepAmount - sweepBalance);
            } else {
                TransferHelper.safeTransferFrom(address(sweep), msg.sender, self, sweepAmount - sweepBalance);
            }
        }

        if(usdxAmount > usdxBalance)
            TransferHelper.safeTransferFrom(address(usdx), msg.sender, self, usdxAmount - usdxBalance);

        TransferHelper.safeApprove(address(usdx), address(nonfungiblePositionManager), usdxAmount);
        TransferHelper.safeApprove(address(sweep), address(nonfungiblePositionManager), sweepAmount);

        (int24 minTick, int24 maxTick) = showTicks(spread);
        IAMM _amm = amm();
        (usdxAmount, sweepAmount, usdxMinIn, sweepMinIn) = flag
            ? (usdxAmount, sweepAmount, usdxMinIn, sweepMinIn)
            : (sweepAmount, usdxAmount, sweepMinIn, usdxMinIn);

        (uint256 _tokenId,,,) = nonfungiblePositionManager.mint(
                INonfungiblePositionManager.MintParams({
                    token0: token0,
                    token1: token1,
                    fee: IUniswapV3Pool(_amm.pool()).fee(),
                    tickLower: minTick,
                    tickUpper: maxTick,
                    amount0Desired: usdxAmount,
                    amount1Desired: sweepAmount,
                    amount0Min: usdxMinIn,
                    amount1Min: sweepMinIn,
                    recipient: address(this),
                    deadline: block.timestamp
                })
            );

        tradePosition = _tokenId;
        _checkRatio();
    }

    function lpRedeem(uint256 usdxAmount, uint256 tickSpread) external onlyBorrower nonReentrant {
        address self = address(this);
        if(redeemPosition > 0) _removePosition(redeemPosition);
        uint256 usdxBalance = usdx.balanceOf(self);
        if(usdxAmount > usdxBalance)
            TransferHelper.safeTransferFrom(address(usdx), msg.sender, self, usdxAmount - usdxBalance);
        TransferHelper.safeApprove(address(usdx), address(nonfungiblePositionManager), usdxAmount);
        redeemPosition = _addSingleLiquidity(tickSpread, usdxAmount, 0);
    }

    function lpGrow(uint256 sweepAmount, uint256 tickSpread) external onlyBorrower nonReentrant {
        if(growPosition > 0) _removePosition(growPosition);
        uint256 sweepBalance = sweep.balanceOf(address(this));
        if(sweepAmount > sweepBalance) _borrow(sweepAmount - sweepBalance);

        TransferHelper.safeApprove(address(sweep), address(nonfungiblePositionManager), sweepAmount);

        growPosition = _addSingleLiquidity(tickSpread, 0, sweepAmount);
        _checkRatio();
    }

    function buySweep(uint256 usdxAmount) external nonReentrant returns (uint256 sweepAmount) {
        if(tradePosition == 0) revert NotMinted();
        sweepAmount = (_oracleUsdxToUsd(usdxAmount) * (10 ** sweep.decimals())) / getBuyPrice();

        _borrow(sweepAmount * 2);

        uint256 usdxMinIn = OvnMath.subBasisPoints(usdxAmount, slippage);
        uint256 sweepMinIn = OvnMath.subBasisPoints(sweepAmount, slippage);

        _addLiquidity(usdxAmount, sweepAmount, usdxMinIn, sweepMinIn);
        TransferHelper.safeTransfer(address(sweep), msg.sender, sweepAmount);

        _checkRatio();
        emit SweepPurchased(usdxAmount);
    }

    /* ========== Internals ========== */
    function _addLiquidity(
        uint256 usdxAmount,
        uint256 sweepAmount,
        uint256 usdxMinIn,
        uint256 sweepMinIn
    ) internal {
        TransferHelper.safeTransferFrom(address(usdx), msg.sender, address(this), usdxAmount);
        TransferHelper.safeApprove(address(usdx), address(nonfungiblePositionManager), usdxAmount);
        TransferHelper.safeApprove(address(sweep), address(nonfungiblePositionManager), sweepAmount);

        (usdxAmount, sweepAmount, usdxMinIn, sweepMinIn) = flag
            ? (usdxAmount, sweepAmount, usdxMinIn, sweepMinIn)
            : (sweepAmount, usdxAmount, sweepMinIn, usdxMinIn);

        nonfungiblePositionManager.increaseLiquidity(
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: tradePosition,
                amount0Desired: usdxAmount,
                amount1Desired: sweepAmount,
                amount0Min: usdxMinIn,
                amount1Min: sweepMinIn,
                deadline: block.timestamp + 60 // Expiration: 1 hour from now
            })
        );

        emit LiquidityAdded(usdxAmount, sweepAmount);
    }

    function _addSingleLiquidity(
        uint256 tickSpread,
        uint256 usdxAmount,
        uint256 sweepAmount
    ) internal returns (uint256) {
        address poolAddress = IAMM(amm()).pool();
        uint8 decimals = sweep.decimals();
        uint256 targetPrice = sweep.targetPrice();
        uint256 maxPrice = ((PRECISION + tickSpread) * targetPrice) / PRECISION;

        int24 tickSpacing = IUniswapV3Pool(poolAddress).tickSpacing();
        uint24 fee = IUniswapV3Pool(poolAddress).fee();
        int24 minTick = liquidityHelper.getTickFromPrice(targetPrice, decimals, tickSpacing, flag);
        int24 maxTick = liquidityHelper.getTickFromPrice(maxPrice, decimals, tickSpacing, flag);
        // (minTick, maxTick) = minTick < maxTick ? (minTick, maxTick) : (maxTick, minTick);

        (uint256 amount0Mint, uint256 amount1Mint) = flag
            ? (usdxAmount, sweepAmount) : (sweepAmount, usdxAmount);

        uint256 amount0Min = OvnMath.subBasisPoints(amount0Mint, slippage);
        uint256 amount1Min = OvnMath.subBasisPoints(amount1Mint, slippage);

        (uint256 _tokenId,,,) = nonfungiblePositionManager.mint(
                INonfungiblePositionManager.MintParams({
                    token0: token0,
                    token1: token1,
                    fee: fee,
                    tickLower: minTick,
                    tickUpper: maxTick,
                    amount0Desired: amount0Mint,
                    amount1Desired: amount1Mint,
                    amount0Min: amount0Min,
                    amount1Min: amount1Min,
                    recipient: address(this),
                    deadline: block.timestamp
                })
            );

        return _tokenId;
    }

    function _collect(uint256 id) internal {
        (uint256 amount0, uint256 amount1) = nonfungiblePositionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: id,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        emit Collected(amount0, amount1);
    }

     /**
     * @notice Get the ticks which will be used in the creating LP
     * @return minTick The minimum tick
     * @return maxTick The maximum tick
     */
    function showTicks(uint256 spread) internal view returns (int24 minTick, int24 maxTick) {
        uint8 decimals = sweep.decimals();
        uint256 sweepPrice = sweep.targetPrice();
        uint256 minPrice = ((PRECISION - spread) * sweepPrice) / PRECISION;
        uint256 maxPrice = ((PRECISION + spread) * sweepPrice) / PRECISION;
        minTick = liquidityHelper.getTickFromPrice(minPrice, decimals, TICK_SPACE, flag);
        maxTick = liquidityHelper.getTickFromPrice(maxPrice, decimals, TICK_SPACE, flag);

        (minTick, maxTick) = minTick < maxTick ? (minTick, maxTick) : (maxTick, minTick);
    }

    function _removePosition(uint256 positionId) internal {
        (,,,,,,,uint128 _liquidity,,,,) = nonfungiblePositionManager.positions(positionId);
        nonfungiblePositionManager.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: positionId,
                liquidity: _liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            })
        );
        _collect(positionId);
        nonfungiblePositionManager.burn(positionId);
    }

    function _addToPosition(uint256 position, uint256 usdxAmount, uint256 sweepAmount) internal view {
        if (position > 0) {
            (uint256 amount0, uint256 amount1,) = amm().getPositions(position);
            usdxAmount += amount0;
            sweepAmount += amount1;
        }
    }

    function _getLiquidity(uint256 position) internal view returns(uint128 liquidity) {
        if(position > 0)
            (,,,,,,, liquidity,,,,) = nonfungiblePositionManager.positions(tradePosition);
    }
}

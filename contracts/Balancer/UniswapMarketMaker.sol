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

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../Stabilizer/Stabilizer.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract UniswapMarketMaker is IERC721Receiver, Stabilizer {
    // Uniswap V3 Position Manager
    INonfungiblePositionManager private constant nonfungiblePositionManager =
        INonfungiblePositionManager(0xC36442b4a4522E871399CD717aBDD847Ab11FE88);
    uint8 private constant TICKS_DELTA = 201;

    // Variables
    address public token0;
    address public token1;
    address public ammAddress;
    bool private immutable flag; // The sort status of tokens

    uint256 private constant PRECISION = 1e6;
    uint256 public tradePosition;
    uint256 public growPosition;
    uint256 public redeemPosition;
    uint32 public slippage;

    // Errors
    error NotMinted();
    error BadSlippage();

    event Collected(uint256 amount0, uint256 amount1);
    event LiquidityAdded(uint256 usdxAmount, uint256 sweepAmount);
    event SweepPurchased(uint256 sweeAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _oracleUsdx,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        slippage = 5000; // 0.5%
        flag = _usdx < _sweep;
        (token0, token1) = flag ? (_usdx, _sweep) : (_sweep, _usdx);
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

    function amm() public view override returns (IAMM) {
        return IAMM(ammAddress);
    }

    /**
    /**
     * @notice Gets the asset price of AMM
     * @return the amm usdx amount
     */
    function assetValue() public view override returns (uint256) {
        uint256 usdxAmount;
        uint256 sweepAmount;
        uint256[3] memory positions = [tradePosition, growPosition, redeemPosition];

        for (uint i = 0; i < 3; i++) {
            if (positions[i] > 0) {
                (uint256 amount0, uint256 amount1,) = amm().getPositions(positions[i]);
                usdxAmount += amount0;
                sweepAmount += amount1;
            }
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

    function setAMM(address newAmm) external nonReentrant onlyBorrower {
        if(newAmm == address(0)) revert ZeroAddressDetected();
        ammAddress = newAmm;
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
    function onERC721Received(address, address, uint256, bytes calldata) external override pure returns (bytes4) {
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
    function removeLiquidity(uint256 tokenId, uint256 liquidityAmount, uint256 amountOut0, uint256 amountOut1)
        external onlyBorrower nonReentrant validAmount(liquidityAmount)
    {
        _decreaseLiquidity(tokenId, uint128(liquidityAmount), amountOut0, amountOut1);
    }

    function lpTrade(uint256 usdxAmount, uint256 sweepAmount, uint256 usdxSlippage, uint256 sweepSlippage, uint256 spread)
        external onlyBorrower whenNotPaused nonReentrant
    {
        if(tradePosition > 0) _removePosition(tradePosition);   
        _approveNFTManager(usdxAmount, sweepAmount);
        
        uint256 sweepPrice = sweep.targetPrice();
        uint256 minPrice = ((PRECISION - spread) * sweepPrice) / PRECISION;
        uint256 maxPrice = ((PRECISION + spread) * sweepPrice) / PRECISION;
        (int24 minTick, int24 maxTick) = _getTicks(minPrice, maxPrice);

        uint256 usdxMinIn = OvnMath.subBasisPoints(usdxAmount, usdxSlippage);
        uint256 sweepMinIn = OvnMath.subBasisPoints(sweepAmount, sweepSlippage);

        (usdxAmount, sweepAmount, usdxMinIn, sweepMinIn) = flag
            ? (usdxAmount, sweepAmount, usdxMinIn, sweepMinIn)
            : (sweepAmount, usdxAmount, sweepMinIn, usdxMinIn);

        tradePosition = _mintPosition(minTick, maxTick, usdxAmount, sweepAmount, usdxMinIn, sweepMinIn);
        _checkRatio();
    }

    function lpRedeem(uint256 usdxAmount, uint256 priceSpread, uint256 usdxSlippage)
        external onlyBorrower nonReentrant
    {
        if(redeemPosition > 0) _removePosition(redeemPosition);
        _approveNFTManager(usdxAmount, 0);

        uint256 targetPrice = sweep.targetPrice();
        uint256 ammPrice = amm().getPriceAtCurrentTick();
        uint256 maxPrice = (targetPrice < ammPrice ? targetPrice : ammPrice) - TICKS_DELTA;
        uint256 minPrice = ((PRECISION - priceSpread) * maxPrice) / PRECISION;

        redeemPosition = _addSingleSidedLiquidity(usdxAmount, 0, usdxSlippage, minPrice, maxPrice);
    }

    function lpGrow(uint256 sweepAmount, uint256 priceSpread, uint256 sweepSlippage)
        external onlyBorrower nonReentrant
    {
        if(growPosition > 0) _removePosition(growPosition);
        _approveNFTManager(0, sweepAmount);

        uint256 targetPrice = sweep.targetPrice();
        uint256 ammPrice = amm().getPriceAtCurrentTick();
        uint256 minPrice = (targetPrice > ammPrice ? targetPrice : ammPrice) + TICKS_DELTA;
        uint256 maxPrice = ((PRECISION + priceSpread) * minPrice) / PRECISION;

        growPosition = _addSingleSidedLiquidity(0, sweepAmount, sweepSlippage, minPrice, maxPrice);
        _checkRatio();
    }

    function buySweep(uint256 usdxAmount) external nonReentrant returns (uint256 sweepAmount) {
        if(tradePosition == 0) revert NotMinted();
        sweepAmount = (_oracleUsdxToUsd(usdxAmount) * (10 ** sweep.decimals())) / getBuyPrice();

        _borrow(sweepAmount * 2);

        uint256 usdxMinIn = OvnMath.subBasisPoints(usdxAmount, slippage);
        uint256 sweepMinIn = OvnMath.subBasisPoints(sweepAmount, slippage);

        TransferHelper.safeTransferFrom(address(usdx), msg.sender, address(this), usdxAmount);
        _addLiquidity(usdxAmount, sweepAmount, usdxMinIn, sweepMinIn);
        TransferHelper.safeTransfer(address(sweep), msg.sender, sweepAmount);

        _checkRatio();
        emit SweepPurchased(usdxAmount);
    }

    function addLiquidity(uint256 usdxAmount, uint256 sweepAmount, uint256 usdxMinIn, uint256 sweepMinIn)
        external onlyBorrower nonReentrant
    {
        _addLiquidity(usdxAmount, sweepAmount, usdxMinIn, sweepMinIn);
    }

    /* ========== Internals ========== */
    function _addLiquidity(uint256 usdxAmount, uint256 sweepAmount, uint256 usdxMinIn, uint256 sweepMinIn) internal {
        _approveNFTManager(usdxAmount, sweepAmount);

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
                deadline: block.timestamp + 60
            })
        );

        emit LiquidityAdded(usdxAmount, sweepAmount);
    }

    function _addSingleSidedLiquidity(
        uint256 usdxAmount,
        uint256 sweepAmount,
        uint256 _slippage,
        uint256 minPrice,
        uint256 maxPrice
    ) internal returns (uint256) {
        (int24 minTick, int24 maxTick) = _getTicks(minPrice, maxPrice);

        (uint256 amount0Mint, uint256 amount1Mint) = flag ? (usdxAmount, sweepAmount) : (sweepAmount, usdxAmount);
        uint256 amount0Min = OvnMath.subBasisPoints(amount0Mint, _slippage);
        uint256 amount1Min = OvnMath.subBasisPoints(amount1Mint, _slippage);

        return _mintPosition(minTick, maxTick, amount0Mint, amount1Mint, amount0Min, amount1Min);
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

    function _removePosition(uint256 positionId) internal {
        (,,,,,,,uint128 _liquidity,,,,) = nonfungiblePositionManager.positions(positionId);
        _decreaseLiquidity(positionId, _liquidity, 0, 0);
        nonfungiblePositionManager.burn(positionId);
    }

    function _getLiquidity(uint256 position) internal view returns(uint128 liquidity) {
        if(position > 0)
            (,,,,,,, liquidity,,,,) = nonfungiblePositionManager.positions(position);
    }

    function _decreaseLiquidity(uint256 positionId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min) internal {
        nonfungiblePositionManager.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: positionId,
                liquidity: liquidity,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                deadline: block.timestamp
            })
        );
        _collect(positionId);
    }

    function _approveNFTManager(uint256 usdxAmount, uint256 sweepAmount) internal {
        if(usdxAmount > 0) TransferHelper.safeApprove(address(usdx), address(nonfungiblePositionManager), usdxAmount);
        if(sweepAmount > 0) TransferHelper.safeApprove(address(sweep), address(nonfungiblePositionManager), sweepAmount);
    }

    function _mintPosition(
        int24 minTick,
        int24 maxTick,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min
    ) internal returns (uint256 tokenId){
        (tokenId,,,) = nonfungiblePositionManager.mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: IUniswapV3Pool(amm().pool()).fee(),
                tickLower: minTick,
                tickUpper: maxTick,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                recipient: address(this),
                deadline: block.timestamp
            })
        );
    }

    function _getTicks(uint256 minPrice, uint256 maxPrice) internal view returns (int24 minTick, int24 maxTick) {
        int24 tickSpacing = IUniswapV3Pool(amm().pool()).tickSpacing();
        uint8 baseDecimals = usdx.decimals();
        uint8 sweepDecimals = sweep.decimals();

        minTick = amm().getTickFromPrice(((minPrice * 10 ** baseDecimals) / PRECISION), sweepDecimals, tickSpacing);
        maxTick = amm().getTickFromPrice(((maxPrice * 10 ** baseDecimals) / PRECISION), sweepDecimals, tickSpacing);
        (minTick, maxTick) = minTick < maxTick ? (minTick, maxTick) : (maxTick, minTick);
    }
}

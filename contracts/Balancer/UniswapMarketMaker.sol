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
    uint256 public tokenId;
    address public token0;
    address public token1;
    bool private immutable flag; // The sort status of tokens
    int24 public constant TICK_SPACE = 10; // TICK_SPACE are 10, 60, 200
    uint256 private constant PRECISION = 1e6;
    uint256[] public positionIds;
    uint32 public slippage; 

    // Errors
    error NotMinted();
    error AlreadyMinted();
    error OnlyPositionManager();
    error BadSlippage();

    event Collected(uint256 amount0, uint256 amount1);
    event LiquidityAdded(uint256 usdxAmount, uint256 sweepAmount);
    event SweepPurchased(uint256 sweeAmount);

    /* ========== Modifies ========== */
    modifier isMinted() {
        if (tokenId == 0) revert NotMinted();
        _;
    }

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

    function liquidity() external view returns (uint128) {
        (,,,,,,,uint128 _liquidity,,,,) = nonfungiblePositionManager.positions(tokenId);
        return _liquidity;
    }

    /**
    /**
     * @notice Gets the asset price of AMM
     * @return the amm usdx amount
     */
    function assetValue() public view override returns (uint256) {
        if (tokenId == 0) return 0;
        (uint256 usdxAmount, uint256 sweepAmount,) = amm().getPositions(tokenId);

        uint256 len = positionIds.length;
        for (uint256 i = 0; i < len; ) {
            uint256 id = positionIds[i];
            (uint256 amount0, uint256 amount1,) = amm().getPositions(id);
            usdxAmount += amount0;
            sweepAmount += amount1;

            unchecked { ++i; }
        }

        return _oracleUsdxToUsd(usdxAmount) + sweep.convertToUSD(sweepAmount);
    }

    function getBuyPrice() public view returns (uint256) {
        uint256 targetPrice = sweep.targetPrice();
        return targetPrice + ((sweep.arbSpread() * targetPrice) / PRECISION);
    }

    /* ========== Actions ========== */

    /**
     * @notice Implementing `onERC721Received` so this contract can receive custody of erc721 tokens
     */
    function onERC721Received(
        address,
        address,
        uint256 _tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        if (msg.sender != address(nonfungiblePositionManager))
            revert OnlyPositionManager();
        if (tokenId > 0) revert AlreadyMinted();
        tokenId = _tokenId;

        return this.onERC721Received.selector;
    }

    /**
     * @notice Increases liquidity in the current range
     * @dev Pool must be initialized already to add liquidity
     * @param usdxAmount USDX Amount of asset to be deposited
     * @param sweepAmount Sweep Amount of asset to be deposited
     * @param usdxMinIn Min USDX amount to be used for liquidity.
     * @param sweepMinIn Min Sweep amount to be used for liquidity.
     */
    function addLiquidity(
        uint256 usdxAmount,
        uint256 sweepAmount,
        uint256 usdxMinIn,
        uint256 sweepMinIn
    )
        external
        onlyBorrower
        whenNotPaused
        nonReentrant
    {
        _borrow(sweepAmount);
        _addLiquidity(usdxAmount, sweepAmount, usdxMinIn, sweepMinIn);
    }

    function buySweep(uint256 usdxAmount) external nonReentrant returns (uint256 sweepAmount) {
        sweepAmount = (_oracleUsdxToUsd(usdxAmount) * (10 ** sweep.decimals())) / getBuyPrice();

        _borrow(sweepAmount * 2);

        uint256 usdxMinIn = OvnMath.subBasisPoints(usdxAmount, slippage);
        uint256 sweepMinIn = OvnMath.subBasisPoints(sweepAmount, slippage);

        _addLiquidity(usdxAmount, sweepAmount, usdxMinIn, sweepMinIn);
        TransferHelper.safeTransfer(address(sweep), msg.sender, sweepAmount);

        if (getEquityRatio() < minEquityRatio) revert EquityRatioExcessed();
        emit SweepPurchased(usdxAmount);
    }

    /**
     * @notice A function that decreases the current liquidity.
     * @param liquidityAmount Liquidity Amount to decrease
     */
    function removeLiquidity(
        uint256 liquidityAmount,
        uint256 amountOut0,
        uint256 amountOut1
    )
        external
        onlyBorrower
        isMinted
        nonReentrant
        validAmount(liquidityAmount)
    {
        // if the amount received after burning is not greater than these minimums, transaction will fail
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
     * @notice Collects the fees associated with provided liquidity
     * @dev The contract must hold the erc721 token before it can collect fees
     */
    function collect()
        external
        onlyBorrower
        whenNotPaused
        nonReentrant
        isMinted
    {
        _collect(tokenId);
    }

    /**
     * @notice Burn NFT
     */
    function burnNFT() external onlyBorrower nonReentrant isMinted {
        nonfungiblePositionManager.burn(tokenId);
        tokenId = 0;
    }

    function initPool(
        uint256 usdxAmount,
        uint256 sweepAmount,
        uint256 usdxMinAmount,
        uint256 sweepMinAmount
    )
        external onlyBorrower nonReentrant
        returns (
            uint256 _tokenId,
            uint128 _liquidity,
            uint256 _amount0,
            uint256 _amount1
        )
    {
        address self = address(this);
        if (sweep.isMintingAllowed()) {
            _borrow(sweepAmount);
        } else {
            TransferHelper.safeTransferFrom(address(sweep), msg.sender, self, sweepAmount);
        }

        TransferHelper.safeTransferFrom(address(usdx), msg.sender, self, usdxAmount);
        TransferHelper.safeApprove(address(usdx), address(nonfungiblePositionManager), usdxAmount);
        TransferHelper.safeApprove(address(sweep), address(nonfungiblePositionManager), sweepAmount);

        (int24 minTick, int24 maxTick) = showTicks();
        IAMM _amm = amm();
        (usdxAmount, sweepAmount, usdxMinAmount, sweepMinAmount) = flag
            ? (usdxAmount, sweepAmount, usdxMinAmount, sweepMinAmount)
            : (sweepAmount, usdxAmount, sweepMinAmount, usdxMinAmount);

        (_tokenId, _liquidity, _amount0, _amount1) = nonfungiblePositionManager
            .mint(
                INonfungiblePositionManager.MintParams({
                    token0: token0,
                    token1: token1,
                    fee: IUniswapV3Pool(_amm.pool()).fee(),
                    tickLower: minTick,
                    tickUpper: maxTick,
                    amount0Desired: usdxAmount,
                    amount1Desired: sweepAmount,
                    amount0Min: usdxMinAmount,
                    amount1Min: sweepMinAmount,
                    recipient: address(this),
                    deadline: block.timestamp
                })
            );

        tokenId = _tokenId;
    }

    function addSingleLiquidity(uint256 usdxAmount, uint256 tickSpread) external onlyBorrower nonReentrant {
        address self = address(this);
        address poolAddress = IAMM(amm()).pool();
        uint8 decimals = sweep.decimals();
        uint256 targetPrice = sweep.targetPrice();
        uint256 minPrice = ((PRECISION - tickSpread) * targetPrice) / PRECISION;

        uint256 sweepAmount;
        TransferHelper.safeTransferFrom(address(usdx), msg.sender, self, usdxAmount);
        TransferHelper.safeApprove(address(usdx), address(nonfungiblePositionManager), usdxAmount);

        int24 tickSpacing = IUniswapV3Pool(poolAddress).tickSpacing();
        int24 minTick = liquidityHelper.getTickFromPrice(minPrice, decimals, tickSpacing, flag);
        int24 maxTick = liquidityHelper.getTickFromPrice(targetPrice, decimals, tickSpacing, flag);
        (minTick, maxTick) = minTick < maxTick ? (minTick, maxTick) : (maxTick, minTick);

        (uint256 amount0Mint, uint256 amount1Mint) = flag
            ? (usdxAmount, sweepAmount)
            : (sweepAmount, usdxAmount);

        (uint256 _tokenId,,,) = nonfungiblePositionManager.mint(
                INonfungiblePositionManager.MintParams({
                    token0: token0,
                    token1: token1,
                    fee: IUniswapV3Pool(poolAddress).fee(),
                    tickLower: minTick,
                    tickUpper: maxTick,
                    amount0Desired: amount0Mint,
                    amount1Desired: amount1Mint,
                    amount0Min: amount0Mint,
                    amount1Min: amount1Mint,
                    recipient: self,
                    deadline: block.timestamp
                })
            );

        positionIds.push(_tokenId);
        emit LiquidityAdded(usdxAmount, sweepAmount);
    }

    function removePosition(uint256 positionId)  external onlyBorrower nonReentrant {
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
        _removePosition(positionId);
    }

    function setSlippage(uint32 newSlippage) external nonReentrant onlyBorrower {
        if(newSlippage > PRECISION) revert BadSlippage();
        slippage = newSlippage;
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
                tokenId: tokenId,
                amount0Desired: usdxAmount,
                amount1Desired: sweepAmount,
                amount0Min: usdxMinIn,
                amount1Min: sweepMinIn,
                deadline: block.timestamp + 60 // Expiration: 1 hour from now
            })
        );

        emit LiquidityAdded(usdxAmount, sweepAmount);
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
    function showTicks() internal view returns (int24 minTick, int24 maxTick) {
        uint256 sweepPrice = sweep.targetPrice();
        uint256 minPrice = (sweepPrice * 99) / 100;
        uint256 maxPrice = (sweepPrice * 101) / 100;
        uint8 decimals = sweep.decimals();

        minTick = liquidityHelper.getTickFromPrice(minPrice, decimals, TICK_SPACE, flag);
        maxTick = liquidityHelper.getTickFromPrice(maxPrice, decimals, TICK_SPACE, flag);

        (minTick, maxTick) = minTick < maxTick ? (minTick, maxTick) : (maxTick, minTick);
    }

    function _removePosition(uint256 positionId) internal {
        uint256 len = positionIds.length;
        for (uint256 i = 0; i < len; ) {
            if(positionIds[i] == positionId) {
                positionIds[i] = positionIds[len-1];
                positionIds.pop();
                return;
            }
            unchecked { ++i; }
        }
    }
}

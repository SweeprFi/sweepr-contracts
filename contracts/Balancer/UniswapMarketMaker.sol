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
    uint128 public liquidity;
    bool private immutable flag; // The sort status of tokens
    int24 public constant TICK_SPACE = 10; // TICK_SPACE are 10, 60, 200
    uint256 private constant PRECISION = 1e6;

    // Errors
    error NotMinted();
    error AlreadyMinted();
    error OnlyPositionManager();

    event Collected(uint256 amount0, uint256 amount1);

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
        flag = _usdx < _sweep;
        (token0, token1) = flag ? (_usdx, _sweep) : (_sweep, _usdx);
        liquidityHelper = LiquidityHelper(_liquidityHelper);
    }

    /* ========== Views ========== */

    /**
    /**
     * @notice Gets the asset price of AMM
     * @return the amm usdx amount
     */
    function assetValue() public view override returns (uint256) {
        if (tokenId == 0) return 0;
        (uint256 usdxAmount, uint256 sweepAmount,) = amm().getPositions(tokenId);

        return _oracleUsdxToUsd(usdxAmount) + sweep.convertToUSD(sweepAmount);
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

        _updateLiquidity(_tokenId);

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

    function buySweep(uint256 sweepAmount, uint256 slippage) external nonReentrant {
        uint256 targetPrice = _oracleUsdToUsdx(sweep.targetPrice());
        uint256 buyPrice = targetPrice + ((sweep.arbSpread() * targetPrice) / PRECISION);
        uint256 usdxAmount = (sweepAmount * buyPrice) / (10 ** sweep.decimals());

        uint256 usdxMinIn = usdxAmount * (PRECISION - slippage) / PRECISION;
        uint256 sweepMinIn = sweepAmount * (PRECISION - slippage) / PRECISION;

        _borrow(sweepAmount*2);
        _addLiquidity(usdxAmount, sweepAmount, usdxMinIn, sweepMinIn);
        TransferHelper.safeTransfer(address(sweep), msg.sender, sweepAmount);
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

        _collect();
        _updateLiquidity(tokenId);
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
        returns (uint256, uint256)
    {
        return _collect();
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
        (uint256 amountAdd0, uint256 amountAdd1) = flag
            ? (usdxAmount, sweepAmount)
            : (sweepAmount, usdxAmount);
        (uint256 minAmount0, uint256 minAmount1) = flag
            ? (usdxMinAmount, sweepMinAmount)
            : (sweepMinAmount, usdxMinAmount);

        (_tokenId, _liquidity, _amount0, _amount1) = nonfungiblePositionManager
            .mint(
                INonfungiblePositionManager.MintParams({
                    token0: token0,
                    token1: token1,
                    fee: _amm.poolFee(),
                    tickLower: minTick,
                    tickUpper: maxTick,
                    amount0Desired: amountAdd0,
                    amount1Desired: amountAdd1,
                    amount0Min: minAmount0,
                    amount1Min: minAmount1,
                    recipient: address(this),
                    deadline: block.timestamp
                })
            );

        _updateLiquidity(_tokenId);
        tokenId = _tokenId;
    }

    function _addLiquidity(
        uint256 usdxAmount,
        uint256 sweepAmount,
        uint256 usdxMinIn,
        uint256 sweepMinIn
    ) internal {
        TransferHelper.safeApprove(address(usdx), address(nonfungiblePositionManager), usdxAmount);
        TransferHelper.safeApprove(address(sweep), address(nonfungiblePositionManager), sweepAmount);
        TransferHelper.safeTransferFrom(address(usdx), msg.sender, address(this), usdxAmount);

        uint128 _liquidity;
        uint256 _amount0;
        uint256 _amount1;
        (uint256 amountAdd0, uint256 amountAdd1) = flag
            ? (usdxAmount, sweepAmount)
            : (sweepAmount, usdxAmount);
        (uint256 minAmount0, uint256 minAmount1) = flag
            ? (usdxMinIn, sweepMinIn)
            : (sweepMinIn, usdxMinIn);

        (_liquidity, _amount0, _amount1) = nonfungiblePositionManager
                .increaseLiquidity(
                    INonfungiblePositionManager.IncreaseLiquidityParams({
                        tokenId: tokenId,
                        amount0Desired: amountAdd0,
                        amount1Desired: amountAdd1,
                        amount0Min: minAmount0,
                        amount1Min: minAmount1,
                        deadline: block.timestamp + 60 // Expiration: 1 hour from now
                    })
                );
        liquidity += _liquidity;
    }

    function _collect() internal returns (uint256 amount0, uint256 amount1) {
        (amount0, amount1) = nonfungiblePositionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
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

        minTick = liquidityHelper.getTickFromPrice(
            minPrice,
            decimals,
            TICK_SPACE,
            flag
        );

        maxTick = liquidityHelper.getTickFromPrice(
            maxPrice,
            decimals,
            TICK_SPACE,
            flag
        );

        (minTick, maxTick) = minTick < maxTick
            ? (minTick, maxTick)
            : (maxTick, minTick);
    }

    function _updateLiquidity(uint256 _tokenId) internal {
        (,,,,,,,uint128 _liquidity,,,,) = nonfungiblePositionManager.positions(_tokenId);
        liquidity = _liquidity;
    }
}

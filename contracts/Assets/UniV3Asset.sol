// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ======================== UniV3Asset.sol ============================
// ====================================================================

/**
 * @title Uniswap V3 Asset
 * @dev Implementation:
 * Mints a new LP.
 * Increases and decreases the liquidity for the LP created.
 * Collects fees from the LP.
 */

import "../Stabilizer/Stabilizer.sol";
import "../Utils/LiquidityHelper.sol";

import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract UniV3Asset is IERC721Receiver, Stabilizer {
    // Variables
    uint256 public tokenId;
    address public token0;
    address public token1;
    uint128 public liquidity;
    int24 public constant tickSpacing = 10; // TickSpacings are 10, 60, 200
    bool private immutable flag; // The sort status of tokens

    // Uniswap V3 Position Manager
    INonfungiblePositionManager public constant nonfungiblePositionManager =
        INonfungiblePositionManager(0xC36442b4a4522E871399CD717aBDD847Ab11FE88);
    LiquidityHelper private immutable liquidityHelper;

    // Events
    event Mint(uint256 tokenId, uint128 liquidity);
    event Collected(uint256 amount0, uint256 amount1);

    // Errors
    error NotMinted();
    error AlreadyMinted();
    error InvalidTokenID();
    error NonEmptyLiquidity();
    error OnlyPositionManager();

    /* ========== Modifies ========== */

    modifier isMinted() {
        if (tokenId == 0) revert NotMinted();
        _;
    }

    constructor(
        string memory name,
        address sweepAddress,
        address usdxAddress,
        address liquidityHelper_,
        address borrower
    )
        Stabilizer(
            name,
            sweepAddress,
            usdxAddress,
            borrower
        )
    {
        flag = usdxAddress < sweepAddress;

        (token0, token1) = flag
            ? (usdxAddress, sweepAddress)
            : (sweepAddress, usdxAddress);

        liquidityHelper = LiquidityHelper(liquidityHelper_);
    }

    /* ========== Views ========== */

    /**
     * @notice Current Value of investment.
     * @return total with 6 decimal to be compatible with dollar coins.
     */
    function currentValue() public view override returns (uint256) {
        uint256 accruedFeeInUSD = sweep.convertToUSD(accruedFee());
        return assetValue() + super.currentValue() - accruedFeeInUSD;
    }

    /**
     * @notice Gets the asset price of AMM
     * @return the amm usdx amount
     */
    function assetValue() public view returns (uint256) {
        if (tokenId == 0) return 0;

        (uint256 amount0, uint256 amount1) = liquidityHelper
            .getTokenAmountsFromLP(tokenId, token0, token1, amm().poolFee());

        (uint256 usdxAmount, uint256 sweepAmount) = flag
            ? (amount0, amount1)
            : (amount1, amount0);

        return usdxAmount + sweep.convertToUSD(sweepAmount);
    }

    /* ========== Actions ========== */

    /**
     * @notice Implementing `onERC721Received` so this contract can receive custody of erc721 tokens
     */
    function onERC721Received(
        address,
        address,
        uint256 tokenId_,
        bytes calldata
    ) external override returns (bytes4) {
        if(msg.sender != address(nonfungiblePositionManager)) revert OnlyPositionManager();
        if (tokenId > 0) revert AlreadyMinted();
        _createDeposit(tokenId_);

        return this.onERC721Received.selector;
    }

    /**
     * @notice Increases liquidity in the current range
     * @dev Pool must be initialized already to add liquidity
     * @param usdxAmount USDX Amount of asset to be deposited
     * @param sweepAmount Sweep Amount of asset to be deposited
     */
    function invest(
        uint256 usdxAmount,
        uint256 sweepAmount
    )
        external
        onlyBorrower
        whenNotPaused
        validAmount(usdxAmount)
        validAmount(sweepAmount)
    {
        _invest(usdxAmount, sweepAmount);
    }

    /**
     * @notice A function that decreases the current liquidity.
     * @param liquidityAmount Liquidity Amount to decrease
     */
    function divest(
        uint256 liquidityAmount
    ) external onlyBorrower isMinted validAmount(liquidityAmount) {
        _divest(liquidityAmount, 0);
    }

    /**
     * @notice Collects the fees associated with provided liquidity
     * @dev The contract must hold the erc721 token before it can collect fees
     */
    function collect()
        public
        onlyBorrower
        whenNotPaused
        isMinted
        returns (uint256 amount0, uint256 amount1)
    {
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
     * @notice Burn NFT
     */
    function burnNFT() external onlyBorrower isMinted {
        nonfungiblePositionManager.burn(tokenId);
        tokenId = 0;
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
            tickSpacing,
            flag
        );

        maxTick = liquidityHelper.getTickFromPrice(
            maxPrice,
            decimals,
            tickSpacing,
            flag
        );

        (minTick, maxTick) = minTick < maxTick
            ? (minTick, maxTick)
            : (maxTick, minTick);
    }

    function _createDeposit(uint256 tokenId_) internal {
        (,,address token0_,address token1_,,,,uint128 liquidity_,,,,) = 
            nonfungiblePositionManager.positions(tokenId_);

        if (token0 != token0_ || token1 != token1_) revert InvalidTokenID();

        liquidity = liquidity_;
        tokenId = tokenId_;

        emit Mint(tokenId_, liquidity_);
    }

    /**
     * @notice Calls the mint function defined in periphery, mints the same amount of each token.
     * For this example we are providing 1000 USDX and 1000 address(SWEEP) in liquidity
     * @dev Pool must be initialized already to add liquidity
     * @param amount0ToMint Amount of USDX
     * @param amount1ToMint Amount of SWEEP
     * @return tokenId_ The id of the newly minted ERC721
     * @return liquidity_ The amount of liquidity for the position
     * @return amount0 The amount of token0
     * @return amount1 The amount of token1
     */
    function _mint(
        uint256 amount0ToMint,
        uint256 amount1ToMint
    )
        internal
        returns (
            uint256 tokenId_,
            uint128 liquidity_,
            uint256 amount0,
            uint256 amount1
        )
    {
        (int24 minTick, int24 maxTick) = showTicks();

        (tokenId_, liquidity_, amount0, amount1) = nonfungiblePositionManager
            .mint(
                INonfungiblePositionManager.MintParams({
                    token0: token0,
                    token1: token1,
                    fee: amm().poolFee(),
                    tickLower: minTick,
                    tickUpper: maxTick,
                    amount0Desired: amount0ToMint,
                    amount1Desired: amount1ToMint,
                    amount0Min: 0,
                    amount1Min: 0,
                    recipient: address(this),
                    deadline: block.timestamp
                })
            );

        // Create a deposit
        _createDeposit(tokenId_);
    }

    function _invest(
        uint256 usdxAmount,
        uint256 sweepAmount
    ) internal override {
        (uint256 usdxBalance, uint256 sweepBalance) = _balances();
        if(usdxBalance < usdxAmount) usdxAmount = usdxBalance;
        if(sweepBalance < sweepAmount) sweepAmount = sweepBalance;

        TransferHelper.safeApprove(
            address(usdx),
            address(nonfungiblePositionManager),
            usdxAmount
        );

        TransferHelper.safeApprove(
            address(sweep),
            address(nonfungiblePositionManager),
            sweepAmount
        );

        uint128 liquidity_;
        uint256 amount0;
        uint256 amount1;
        (uint256 amountAdd0, uint256 amountAdd1) = flag
            ? (usdxAmount, sweepAmount)
            : (sweepAmount, usdxAmount);

        if (tokenId == 0) {
            (, liquidity_, amount0, amount1) = _mint(amountAdd0, amountAdd1);
        } else {
            (liquidity_, amount0, amount1) = nonfungiblePositionManager
                .increaseLiquidity(
                    INonfungiblePositionManager.IncreaseLiquidityParams({
                        tokenId: tokenId,
                        amount0Desired: amountAdd0,
                        amount1Desired: amountAdd1,
                        amount0Min: 0,
                        amount1Min: 0,
                        deadline: block.timestamp + 60 // Expiration: 1 hour from now
                    })
                );
            liquidity += liquidity_;
        }

        if (flag) emit Invested(amount0, amount1);
        else emit Invested(amount1, amount0);
    }

    function _divest(uint256 liquidityAmount, uint256) internal override {
        uint128 decreaseLP = uint128(liquidityAmount);
        if (decreaseLP > liquidity) decreaseLP = liquidity;
        liquidity -= decreaseLP;

        // amount0Min and amount1Min are price slippage checks
        // if the amount received after burning is not greater than these minimums, transaction will fail
        nonfungiblePositionManager.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: decreaseLP,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            })
        );

        (uint256 amount0, uint256 amount1) = collect();

        if (flag) emit Divested(amount0, amount1);
        else emit Divested(amount1, amount0);
    }
}
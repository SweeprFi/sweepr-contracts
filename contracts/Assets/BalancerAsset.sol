// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ======================== BalancerAsset.sol =========================
// ====================================================================

/**
 * @title Balancer Stable/Stable Pool Asset
 * @dev Implementation:
 * Mints a new LP.
 * Increases and decreases the liquidity for the LP created.
 * Collects fees from the LP.
 */

import { Stabilizer, TransferHelper } from "../Stabilizer/Stabilizer.sol";
import { IBalancerPool, IBalancerVault, IAsset, JoinKind, ExitKind } from "./Balancer/IBalancer.sol";

contract BalancerAsset is Stabilizer {

    error BadAddress(address asset);

    IBalancerPool public pool;
    IBalancerVault public vault;

    uint24 private constant PRECISION = 1e6;
    uint256 private constant ACTION = 1;

    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _oracleUsdx,
        address _poolAddress,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        pool = IBalancerPool(_poolAddress);
        vault = IBalancerVault(pool.getVault());
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
        return _oracleUsdxToUsd(bpt4BalanceInUsdx());
    }

    function bpt4BalanceInUsdx() private view returns (uint256) {
        uint256 bpt4 = pool.balanceOf(address(this));
        uint256 rate = pool.getRate();
        return (bpt4 * rate * (10 ** usdx.decimals())) / (10 ** (pool.decimals() * 2));
    }

    /* ========== Actions ========== */

    /**
     * @notice Increases liquidity in the current range
     * @dev Pool must be initialized already to add liquidity
     * @param usdxAmount USDX Amount of asset to be deposited
     * @param slippage Slippage tolerance
     */
    function invest(uint256 usdxAmount, uint256 slippage)
        external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount)
    {
        _invest(usdxAmount, 0, slippage);
    }

    /**
     * @notice A function that decreases the current liquidity.
     * @param usdxAmount Amount to divest
     */
    function divest(uint256 usdxAmount, uint256 slippage)
        external onlyBorrower nonReentrant
    {
        emit Divested(_divest(usdxAmount, slippage));
    }

    function _invest(uint256 usdxAmount, uint256, uint256 slippage) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(address(usdx), address(vault), usdxAmount);

        bytes32 poolId = pool.getPoolId();
        address self = address(this);
        
        (IAsset[] memory assets, , ) = vault.getPoolTokens(poolId);
        uint8 usdxIndex = findAssetIndex(address(usdx), assets);

        uint256[] memory amounts = new uint256[](5);
        amounts[usdxIndex] = usdxAmount;
        uint256[] memory userDataAmounts = new uint256[](4);
        userDataAmounts[usdxIndex-1] = usdxAmount;

        uint256 usdxAmountOut = usdxAmount * (10 ** (pool.decimals()+12)) / pool.getTokenRate(address(usdx));
        uint256 minAmountOut = usdxAmountOut * (PRECISION - slippage) / PRECISION;
        bytes memory userData = abi.encode(JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, userDataAmounts, minAmountOut);

        IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest(assets, amounts, userData, false);
        vault.joinPool(poolId, self, self, request);

        emit Invested(usdxAmount);
    }

    function _divest(uint256 usdxAmount, uint256 slippage) internal override returns (uint256) {
        uint256 bpt4UsdxBalance = bpt4BalanceInUsdx();
        if (bpt4UsdxBalance < usdxAmount) usdxAmount = bpt4UsdxBalance;

        address self = address(this);
        bytes32 poolId = pool.getPoolId();
        uint256 maxAmountIn = pool.balanceOf(self);
        uint maxAmountOut = usdxAmount * (PRECISION - slippage) / PRECISION;

        (IAsset[] memory assets, , ) = vault.getPoolTokens(poolId);
        uint8 usdxIndex = findAssetIndex(address(usdx), assets);

        uint256[] memory amounts = new uint256[](5);
        amounts[usdxIndex] = maxAmountOut;

        uint256[] memory userDataAmounts = new uint256[](4);
        userDataAmounts[usdxIndex-1] = maxAmountOut;

        bytes memory userData = abi.encode(ExitKind.BPT_IN_FOR_EXACT_TOKENS_OUT, userDataAmounts, maxAmountIn);

        IBalancerVault.ExitPoolRequest memory request = IBalancerVault.ExitPoolRequest(assets, amounts, userData, false);
        vault.exitPool(poolId, self, self, request);
        return usdxAmount;
    }

    function findAssetIndex(address asset, IAsset[] memory assets) internal pure returns (uint8) {
        for (uint8 i = 0; i < assets.length; i++) {
            if ( address(assets[i]) == asset ) {
                return i;
            }
        }
        revert BadAddress(asset);
    }

}

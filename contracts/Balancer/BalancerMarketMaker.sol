// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ======================== BalancerMarketMaker.sol ===================
// ====================================================================

/**
 * @title Balancer Stable/Stable Pool Market Maker
 * @dev Implementation:
 * Increases and decreases the liquidity
 */

import { Stabilizer, TransferHelper } from "../Stabilizer/Stabilizer.sol";
import { IBalancerPool, IBalancerVault, IAsset, JoinKind, ExitKind } from "../Assets/Balancer/IBalancer.sol";

import "hardhat/console.sol";

contract BalancerMarketMaker is Stabilizer {

    error BadAddress(address asset);

    event LiquidityAdded(uint256 usdxAmount, uint256 sweepAmount);
    event LiquidityRemoved(uint256 usdxAmount, uint256 sweepAmount);
    event SweepPurchased(uint256 sweeAmount);

    IBalancerPool pool;
    IBalancerVault vault;

    uint24 private constant PRECISION = 1e6;

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
        uint256 bpt = pool.balanceOf(address(this));
        uint256 rate = pool.getRate();

        return (bpt * rate * (10 ** usdx.decimals())) / (10 ** (pool.decimals() * 2));

        // return _oracleUsdxToUsd(bpt4BalanceInUsdx());
    }

    /* ========== Actions ========== */

    function buySweep(uint256 sweepAmount, uint256 slippage) external {
        uint256 sweepAvailable = sweep.minters(address(this)).maxAmount - sweepBorrowed;
        if (sweepAvailable < sweepAmount*2) revert NotEnoughBalance();

        uint256 targetPrice = sweep.targetPrice();
        uint256 buyPrice = targetPrice + ((sweep.arbSpread() * targetPrice) / PRECISION);
        uint256 usdxAmount = (sweepAmount * buyPrice) / (10 ** sweep.decimals());


        TransferHelper.safeTransferFrom(address(usdx), msg.sender, address(this), usdxAmount);
        _borrow(sweepAmount*2);

        _addLiquidity(0, sweepAmount, slippage);

        TransferHelper.safeTransfer(address(sweep), msg.sender, sweepAmount);
        emit SweepPurchased(usdxAmount);
    }

    function initPool() external onlyBorrower{
        address self = address(this);
        uint256 sweepAmount = 1e18;
        uint256 usdxAmount = 1e6;

        TransferHelper.safeTransferFrom(address(usdx), msg.sender, self, usdxAmount);
        TransferHelper.safeApprove(address(usdx), address(vault), usdxAmount);
        TransferHelper.safeApprove(address(sweep), address(vault), sweepAmount);

        _borrow(sweepAmount);

        bytes32 poolId = pool.getPoolId();
        (IAsset[] memory assets, , ) = vault.getPoolTokens(poolId);

        uint8 sweepIndex = findAssetIndex(address(sweep), assets);
        uint8 usdxIndex = findAssetIndex(address(usdx), assets);
        uint8 bptIndex = findAssetIndex(address(pool), assets);

        uint256[] memory amounts = new uint256[](3);
        amounts[bptIndex] = 2**112;
        amounts[usdxIndex] = usdxAmount;
        amounts[sweepIndex] = sweepAmount;

        uint256[] memory userDataAmounts = new uint256[](3);
        userDataAmounts[bptIndex] = 2**112;
        userDataAmounts[usdxIndex] = usdxAmount;
        userDataAmounts[sweepIndex] = sweepAmount;

        bytes memory userData = abi.encode(JoinKind.INIT, userDataAmounts);

        IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest(assets, amounts, userData, false);
        vault.joinPool(poolId, self, self, request);
    }

    function _addLiquidity(uint256 usdxAmount, uint256 sweepAmount, uint256 slippage) internal {
        address self = address(this);
        bytes32 poolId = pool.getPoolId();
        (IAsset[] memory assets, , ) = vault.getPoolTokens(poolId);
        
        uint8 sweepIndex = findAssetIndex(address(sweep), assets);
        uint8 usdxIndex = findAssetIndex(address(usdx), assets);

        // TODO: tokens must be sorted
        uint256[] memory amounts = new uint256[](3);
        amounts[usdxIndex] = usdxAmount;
        amounts[sweepIndex] = sweepAmount;

        uint256[] memory userDataAmounts = new uint256[](2);
        userDataAmounts[usdxIndex-1] = usdxAmount;
        userDataAmounts[sweepIndex-1] = sweepAmount;

        uint256 usdxAmountOut = usdxAmount * (10 ** (pool.decimals()+12)) / pool.getRate();
        uint256 sweepAmountOut = sweepAmount * (10 ** pool.decimals()) / pool.getRate();
        // uint256 minUsdxAmountOut = usdxAmountOut * (PRECISION - slippage) / PRECISION;
        // uint256 minSweepAmountOut = sweepAmountOut * (PRECISION - slippage) / PRECISION;
        uint256 minTotalAmountOut = ( usdxAmountOut + sweepAmountOut ) * (PRECISION - slippage) / PRECISION;
        bytes memory userData = abi.encode(JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, userDataAmounts, minTotalAmountOut);

        IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest(assets, amounts, userData, false);
        vault.joinPool(poolId, self, self, request);
    }

    function addLiquidity(uint256 usdxAmount, uint256 sweepAmount, uint256 slippage) external onlyBorrower {
        uint256 sweepLimit = sweep.minters(address(this)).maxAmount;
        uint256 sweepAvailable = sweepLimit - sweepBorrowed;
        if (sweepAvailable < sweepAmount) revert NotEnoughBalance();

        _borrow(sweepAmount);

        _addLiquidity(usdxAmount, sweepAmount, slippage);
     
        emit LiquidityAdded(usdxAmount, sweepAmount);
    }

    function removeLiquidity(uint256 usdxAmount, uint256 sweepAmount, uint256 slippage) external onlyBorrower {
        address self = address(this);
        bytes32 poolId = pool.getPoolId();
        (IAsset[] memory assets, , ) = vault.getPoolTokens(poolId);
        
        uint8 sweepIndex = findAssetIndex(address(sweep), assets);
        uint8 usdxIndex = findAssetIndex(address(usdx), assets);

        uint256 maxAmountIn = pool.balanceOf(self);
        uint maxUsdxAmountOut = usdxAmount * (PRECISION - slippage) / PRECISION;
        uint maxSweepAmountOut = sweepAmount * (PRECISION - slippage) / PRECISION;

        uint256[] memory amounts = new uint256[](3);
        amounts[usdxIndex] = maxUsdxAmountOut;
        amounts[sweepIndex] = maxSweepAmountOut;

        uint256[] memory userDataAmounts = new uint256[](2);
        userDataAmounts[usdxIndex-1] = maxUsdxAmountOut;
        userDataAmounts[sweepIndex-1] = maxSweepAmountOut;

        bytes memory userData = abi.encode(ExitKind.BPT_IN_FOR_EXACT_TOKENS_OUT, userDataAmounts, maxAmountIn);

        IBalancerVault.ExitPoolRequest memory request = IBalancerVault.ExitPoolRequest(assets, amounts, userData, false);
        vault.exitPool(poolId, self, self, request);

        _repay(sweepAmount);


        emit LiquidityRemoved(usdxAmount, sweepAmount);
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

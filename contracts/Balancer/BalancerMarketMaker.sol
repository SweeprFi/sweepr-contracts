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

import { Stabilizer, TransferHelper, ISweep } from "../Stabilizer/Stabilizer.sol";
import { IBalancerPool, IBalancerVault, IAsset, JoinKind, ExitKind } from "../Assets/Balancer/IBalancer.sol";

contract BalancerMarketMaker is Stabilizer {

    error BadAddress(address asset);

    event LiquidityAdded(uint256 usdxAmount, uint256 sweepAmount);
    event LiquidityRemoved(uint256 usdxAmount, uint256 sweepAmount);
    event SweepPurchased(uint256 sweeAmount);

    IBalancerPool public pool;
    IBalancerVault public vault;

    bytes32 public poolId;
    IAsset[] public poolAssets;

    uint8 public sweepIndex;
    uint8 public usdxIndex;
    uint8 public bptIndex;
    
    uint24 private constant PRECISION = 1e6;

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

        poolId = pool.getPoolId();
        (poolAssets, , ) = vault.getPoolTokens(poolId);
        sweepIndex = findAssetIndex(address(sweep), poolAssets);
        usdxIndex = findAssetIndex(address(usdx), poolAssets);
        bptIndex = findAssetIndex(address(pool), poolAssets);
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

        uint256 usdcAmount = (bpt * rate * (10 ** usdx.decimals())) / (10 ** (pool.decimals() * 2));

        return _oracleUsdxToUsd(usdcAmount);
    }

    /* ========== Actions ========== */

    function buySweep(uint256 sweepAmount, uint256 slippage) external nonReentrant {
        uint256 sweepAvailable = sweep.minters(address(this)).maxAmount - sweepBorrowed;
        if (sweepAvailable < sweepAmount*2) revert NotEnoughBalance();

        uint256 targetPrice = _oracleUsdToUsdx(sweep.targetPrice());
        uint256 buyPrice = targetPrice + ((sweep.arbSpread() * targetPrice) / PRECISION);
        uint256 usdxAmount = (sweepAmount * buyPrice) / (10 ** sweep.decimals());

        TransferHelper.safeTransferFrom(address(usdx), msg.sender, address(this), usdxAmount);
        TransferHelper.safeApprove(address(usdx), address(vault), usdxAmount);
        TransferHelper.safeApprove(address(sweep), address(vault), sweepAmount);

        _borrow(sweepAmount*2);

        _addLiquidity(usdxAmount, sweepAmount, slippage);

        TransferHelper.safeTransfer(address(sweep), msg.sender, sweepAmount);
        emit SweepPurchased(usdxAmount);
    }

    function initPool(uint256 usdxAmount, uint256 sweepAmount) external nonReentrant onlyBorrower {
        address self = address(this);

        if(sweep.isMintingAllowed()){
            _borrow(sweepAmount);
        } else {
            TransferHelper.safeTransferFrom(address(sweep), msg.sender, self, sweepAmount);
        }

        TransferHelper.safeTransferFrom(address(usdx), msg.sender, self, usdxAmount);
        TransferHelper.safeApprove(address(usdx), address(vault), usdxAmount);
        TransferHelper.safeApprove(address(sweep), address(vault), sweepAmount);

        uint256[] memory amounts = new uint256[](3);
        amounts[bptIndex] = 2**112;
        amounts[usdxIndex] = usdxAmount;
        amounts[sweepIndex] = sweepAmount;

        bytes memory userData = abi.encode(JoinKind.INIT, amounts);

        IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest(poolAssets, amounts, userData, false);
        vault.joinPool(poolId, self, self, request);
    }

    function _addLiquidity(uint256 usdxAmount, uint256 sweepAmount, uint256 slippage) internal {
        address self = address(this);
        
        uint256[] memory amounts = new uint256[](3);
        amounts[usdxIndex] = usdxAmount;
        amounts[sweepIndex] = sweepAmount;

        uint256[] memory userDataAmounts = new uint256[](2);
        userDataAmounts[0] = (sweepIndex > usdxIndex) ? usdxAmount : sweepAmount;
        userDataAmounts[1] = (sweepIndex > usdxIndex) ? sweepAmount : usdxAmount;

        uint256 usdxAmountOut = usdxAmount * (10 ** (pool.decimals()+12)) / pool.getTokenRate(address(usdx));
        uint256 sweepAmountOut = sweepAmount * (10 ** pool.decimals()) / pool.getTokenRate(address(sweep));
        uint256 minTotalAmountOut = (usdxAmountOut + sweepAmountOut) * (PRECISION - slippage) / PRECISION;

        bytes memory userData = abi.encode(JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, userDataAmounts, minTotalAmountOut);

        IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest(poolAssets, amounts, userData, false);
        vault.joinPool(poolId, self, self, request);
    }

    function addLiquidity(uint256 usdxAmount, uint256 sweepAmount, uint256 slippage) external nonReentrant onlyBorrower {
        address self = address(this);

        if(sweep.isMintingAllowed()){
            uint256 sweepLimit = sweep.minters(address(this)).maxAmount;
            uint256 sweepAvailable = sweepLimit - sweepBorrowed;
            if (sweepAvailable < sweepAmount) revert NotEnoughBalance();
            if(sweepAmount > 0) _borrow(sweepAmount);
        } else {
            TransferHelper.safeTransferFrom(address(sweep), msg.sender, self, sweepAmount);
        }

        TransferHelper.safeTransferFrom(address(usdx), msg.sender, self, usdxAmount);

        TransferHelper.safeApprove(address(usdx), address(vault), usdxAmount);
        TransferHelper.safeApprove(address(sweep), address(vault), sweepAmount);

        _addLiquidity(usdxAmount, sweepAmount, slippage);

        emit LiquidityAdded(usdxAmount, sweepAmount);
    }

    function removeLiquidity(uint256 usdxAmount, uint256 sweepAmount, uint256 slippage) external nonReentrant onlyBorrower {
        address self = address(this);
        
        uint256 maxAmountIn = pool.balanceOf(self);
        uint maxUsdxAmountOut = usdxAmount * (PRECISION - slippage) / PRECISION;
        uint maxSweepAmountOut = sweepAmount * (PRECISION - slippage) / PRECISION;

        uint256[] memory amounts = new uint256[](3);
        amounts[usdxIndex] = maxUsdxAmountOut;
        amounts[sweepIndex] = maxSweepAmountOut;

        uint256[] memory userDataAmounts = new uint256[](2);
        userDataAmounts[0] = (sweepIndex > usdxIndex) ? usdxAmount : sweepAmount;
        userDataAmounts[1] = (sweepIndex > usdxIndex) ? sweepAmount : usdxAmount;

        bytes memory userData = abi.encode(ExitKind.BPT_IN_FOR_EXACT_TOKENS_OUT, userDataAmounts, maxAmountIn);

        IBalancerVault.ExitPoolRequest memory request = IBalancerVault.ExitPoolRequest(poolAssets, amounts, userData, false);
        vault.exitPool(poolId, self, self, request);

        if(sweepAmount > 0) _repay(sweepAmount);

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

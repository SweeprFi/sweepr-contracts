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
import { IBalancerPool, IBalancerVault, IAsset, JoinKind, ExitKind } from "../Assets/Interfaces/Balancer/IBalancer.sol";

contract BalancerMarketMaker is Stabilizer {

    error BadAddress();
    error BadSlippage();

    event PoolInitialized(uint256 usdxAmount, uint256 sweepAmount);
    event LiquidityAdded(uint256 usdxAmount, uint256 sweepAmount);
    event LiquidityRemoved(uint256 usdxAmount, uint256 sweepAmount);
    event SweepPurchased(uint256 usdxAmount, uint256 sweepAmount);

    IBalancerPool public pool;
    IBalancerVault public vault;

    bytes32 public poolId;
    IAsset[] public poolAssets;

    uint8 public sweepIndex;
    uint8 public usdxIndex;
    uint8 public bptIndex;

    uint32 public slippage; 

    uint24 private constant PRECISION = 1e6;

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _oracleUsdx,
        address _poolAddress,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        slippage = 5000; // 0.5%
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
     * @notice Gets the asset price of AMM
     * @return the amm usdx amount
     */
    function assetValue() public view override returns (uint256) {    
        uint256 bpt = pool.balanceOf(address(this));
        if(bpt == 0) return 0;

        uint256 rate = pool.getRate();

        uint256 usdcAmount = (bpt * rate * (10 ** usdx.decimals())) / (10 ** (pool.decimals() * 2));

        return _oracleUsdxToUsd(usdcAmount);
    }

    function getBuyPrice() public view returns (uint256) {
        uint256 targetPrice = sweep.targetPrice();
        return targetPrice + ((sweep.arbSpread() * targetPrice) / PRECISION);
    }

    /* ========== Actions ========== */

    function liquidate() external nonReentrant {
        if(auctionAllowed) revert ActionNotAllowed();
        _liquidate(_getToken(), getDebt());
    }

    function _getToken() internal view override returns (address) {
        return address(pool);
    }

    function buySweep(uint256 usdxAmount) external nonReentrant returns (uint256 sweepAmount) {
        sweepAmount = (_oracleUsdxToUsd(usdxAmount) * (10 ** sweep.decimals())) / getBuyPrice();

        TransferHelper.safeTransferFrom(address(usdx), msg.sender, address(this), usdxAmount);
        _borrow(sweepAmount * 2);
        _addLiquidity(usdxAmount, sweepAmount, slippage);
        TransferHelper.safeTransfer(address(sweep), msg.sender, sweepAmount);

        _checkRatio();
        emit SweepPurchased(usdxAmount, sweepAmount);
    }

    function initPool(uint256 usdxAmount, uint256 sweepAmount) external nonReentrant onlyBorrower {
        TransferHelper.safeApprove(address(usdx), address(vault), usdxAmount);
        TransferHelper.safeApprove(address(sweep), address(vault), sweepAmount);

        uint256[] memory amounts = new uint256[](3);
        amounts[bptIndex] = 2**112;
        amounts[usdxIndex] = usdxAmount;
        amounts[sweepIndex] = sweepAmount;

        bytes memory userData = abi.encode(JoinKind.INIT, amounts);

        IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest(poolAssets, amounts, userData, false);
        vault.joinPool(poolId, address(this), address(this), request);

        emit PoolInitialized(usdxAmount, sweepAmount);
    }

    function _addLiquidity(uint256 usdxAmount, uint256 sweepAmount, uint256 _slippage) internal {
        address self = address(this);

        TransferHelper.safeApprove(address(usdx), address(vault), usdxAmount);
        TransferHelper.safeApprove(address(sweep), address(vault), sweepAmount);
        
        uint256[] memory amounts = new uint256[](3);
        amounts[usdxIndex] = usdxAmount;
        amounts[sweepIndex] = sweepAmount;

        uint256[] memory userDataAmounts = new uint256[](2);
        userDataAmounts[0] = (sweepIndex > usdxIndex) ? usdxAmount : sweepAmount;
        userDataAmounts[1] = (sweepIndex > usdxIndex) ? sweepAmount : usdxAmount;

        uint256 usdxMin = usdxAmount * pool.getTokenRate(address(usdx)) / (10 ** usdx.decimals());
        uint256 sweepMin = sweepAmount * pool.getTokenRate(address(sweep)) / (10 ** sweep.decimals());
        uint256 minTotalAmountOut = (usdxMin + sweepMin) * (PRECISION - _slippage) / PRECISION;

        bytes memory userData = abi.encode(JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, userDataAmounts, minTotalAmountOut);

        IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest(poolAssets, amounts, userData, false);
        vault.joinPool(poolId, self, self, request);
    }

    function addLiquidity(uint256 usdxAmount, uint256 sweepAmount, uint256 _slippage) external nonReentrant onlyBorrower {
        _addLiquidity(usdxAmount, sweepAmount, _slippage);
        emit LiquidityAdded(usdxAmount, sweepAmount);
    }

    function removeLiquidity(uint256 usdxAmount, uint256 sweepAmount, uint256 _slippage) external nonReentrant onlyBorrower {
        address self = address(this);

        uint256 usdxMax = usdxAmount * pool.getTokenRate(address(usdx)) / (10**usdx.decimals());
        uint256 sweepMax = sweepAmount * pool.getTokenRate(address(sweep)) / (10**sweep.decimals());
        uint256 maxAmountIn = (usdxMax + sweepMax) * (PRECISION + _slippage) / PRECISION;

        uint256[] memory amounts = new uint256[](3);
        amounts[usdxIndex] = usdxAmount;
        amounts[sweepIndex] = sweepAmount;

        uint256[] memory userDataAmounts = new uint256[](2);
        userDataAmounts[0] = (sweepIndex > usdxIndex) ? usdxAmount : sweepAmount;
        userDataAmounts[1] = (sweepIndex > usdxIndex) ? sweepAmount : usdxAmount;

        bytes memory userData = abi.encode(ExitKind.BPT_IN_FOR_EXACT_TOKENS_OUT, userDataAmounts, maxAmountIn);

        IBalancerVault.ExitPoolRequest memory request = IBalancerVault.ExitPoolRequest(poolAssets, amounts, userData, false);
        vault.exitPool(poolId, self, self, request);

        emit LiquidityRemoved(usdxAmount, sweepAmount);
    }

    function setSlippage(uint32 newSlippage) external nonReentrant onlyBorrower {
        if(newSlippage > PRECISION) revert BadSlippage();
        slippage = newSlippage;
    }

    function findAssetIndex(address asset, IAsset[] memory assets) internal pure returns (uint8) {
        for (uint8 i = 0; i < assets.length; i++) {
            if ( address(assets[i]) == asset ) return i;
        }
        revert BadAddress();
    }

}

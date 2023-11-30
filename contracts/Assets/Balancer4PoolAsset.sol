// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ======================== Balancer4PoolAsset.sol =========================
// ====================================================================

/**
 * @title Balancer Stable/Stable Pool Asset
 * @dev Implementation:
 * Mints a new LP.
 * Increases and decreases the liquidity for the LP created.
 * Collects fees from the LP.
 */

import { Stabilizer, TransferHelper, IERC20Metadata } from "../Stabilizer/Stabilizer.sol";
import { IBalancerGauge, IBalancerPool, IBalancerVault, IAsset, JoinKind, ExitKind } from "./Balancer/IBalancer.sol";

import "hardhat/console.sol";

contract Balancer4PoolAsset is Stabilizer {

    IBalancerPool public pool;
    IBalancerVault public vault;
    IBalancerGauge public gauge;

    bytes32 public poolId;
    IAsset[] public poolAssets;

    uint8 public usdxIndexWithBPT;
    uint8 public usdxIndexWithoutBPT;

    uint24 private constant PRECISION = 1e6;

    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _poolAddress,
        address _gaugeAddress,
        address _oracleUsdx,
        
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        pool = IBalancerPool(_poolAddress);
        vault = IBalancerVault(pool.getVault());
        gauge = IBalancerGauge(_gaugeAddress);

        poolId = pool.getPoolId();
        (poolAssets, , ) = vault.getPoolTokens(poolId);
        usdxIndexWithBPT = 1;
        usdxIndexWithoutBPT = 0;
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
        uint256 bptBalance = pool.balanceOf(address(this)) + gauge.balanceOf(address(this));
        return _oracleUsdxToUsd(inUSDX(bptBalance));
    }

    function inUSDX(uint256 amount) private view returns (uint256) {
        return (amount * pool.getRate() * (10 ** usdx.decimals())) / (10 ** (pool.decimals() * 2));
    }

    function inBPT(uint256 amount) private view returns (uint256) {
        return (amount * (10 ** (pool.decimals() * 2))) / (pool.getRate() * (10 ** usdx.decimals()));
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
        _divest(usdxAmount, slippage);
    }

    function _invest(uint256 usdxAmount, uint256, uint256 slippage) internal override {
        address self = address(this);

        uint256 usdxBalance = usdx.balanceOf(self);
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        uint256[] memory amounts = new uint256[](5);
        amounts[usdxIndexWithBPT] = usdxAmount;

        uint256[] memory userDataAmounts = new uint256[](4);
        userDataAmounts[usdxIndexWithoutBPT] = usdxAmount;

        uint256 bptAmount = inBPT(usdxAmount);
        uint256 minAmountOut = bptAmount * (PRECISION - slippage) / PRECISION;

        bytes memory userData = abi.encode(JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, userDataAmounts, minAmountOut);
        IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest(poolAssets, amounts, userData, false);

        TransferHelper.safeApprove(address(usdx), address(vault), usdxAmount);
        vault.joinPool(poolId, self, self, request);

        uint256 bptBalance = pool.balanceOf(self);
        TransferHelper.safeApprove(address(pool), address(gauge), bptBalance);
        gauge.deposit(bptBalance);

        emit Invested(usdxAmount);
    }

    function _divest(uint256 usdxAmount, uint256 slippage) internal override returns (uint256) {
        address self = address(this);
        uint256 bptAmount = inBPT(usdxAmount);
        uint256 gaugeBalance = gauge.balanceOf(self);
        if (gaugeBalance < bptAmount) bptAmount = gaugeBalance;

        gauge.withdraw(bptAmount);

        usdxAmount = inUSDX(bptAmount);
        uint256 minUsdxAmountOut = usdxAmount * (PRECISION - slippage) / PRECISION;
        uint256[] memory amounts = new uint256[](5);
        amounts[usdxIndexWithBPT] = minUsdxAmountOut;

        bytes memory userData = abi.encode(ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, bptAmount, usdxIndexWithoutBPT);
        IBalancerVault.ExitPoolRequest memory request = IBalancerVault.ExitPoolRequest(poolAssets, amounts, userData, false);

        vault.exitPool(poolId, self, self, request);

        emit Divested(usdxAmount);
        return usdxAmount;
    }

    function collect() external onlyBorrower nonReentrant {
        gauge.claim_rewards();
    }

}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ======================== BalancerAsset.sol ============================
// ====================================================================

/**
 * @title Balancer Stable/Stable Pool Asset
 * @dev Implementation:
 * Mints a new LP.
 * Increases and decreases the liquidity for the LP created.
 * Collects fees from the LP.
 */

import "hardhat/console.sol";

import { Stabilizer, IERC20Metadata, TransferHelper, OvnMath } from "../Stabilizer/Stabilizer.sol";
import { IBalancerPool, IBalancerVault, JoinPoolRequest, ExitPoolRequest, IAsset, JoinKind, ExitKind } from "./Balancer/IBalancer.sol";

contract BalancerAsset is Stabilizer {

    IBalancerPool pool;
    IBalancerVault vault;

    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _oracleUsdx,
        address _borrower,
        address _poolAddress
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
        // Warning: assumes 1e6 (usdc decimals)
        return bpt4 * rate / 1e30;
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
        returns (uint256, uint256)
    {
        _invest(usdxAmount, 0, slippage);
        return (usdxAmount, 0);
    }

    /**
     * @notice A function that decreases the current liquidity.
     * @param usdxAmount Amount to divest
     */
    function divest(uint256 usdxAmount, uint256 slippage) external onlyBorrower nonReentrant returns (uint256) {
        _divest(usdxAmount, slippage);
        return usdxAmount;
    }

    function _invest(uint256 usdxAmount, uint256, uint256 slippage) internal override {

        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(address(usdx), address(vault), usdxAmount);

        bytes32 poolId = pool.getPoolId();
        
        (IAsset[] memory assets, , ) = vault.getPoolTokens(poolId);

        uint256[] memory amounts = new uint256[](5);
        amounts[1] = usdxAmount;

        uint256[] memory userDataAmounts = new uint256[](4);
        userDataAmounts[0] = usdxAmount;

        uint256 usdxAmountOut = usdxAmount * 1e12 / pool.getRate();
        uint minAmountOut = usdxAmountOut * (1e6 - slippage) / 1e6;
        bytes memory userData = abi.encode(JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, userDataAmounts, minAmountOut);

        JoinPoolRequest memory request = JoinPoolRequest(assets, amounts, userData, false);

        vault.joinPool(poolId, address(this), address(this), request);
    
        emit Invested(usdxAmount);
    }

    function _divest(uint256 usdxAmount, uint256 slippage) internal override returns (uint256) {
        uint256 bpt4UsdxBalance = bpt4BalanceInUsdx();
        if (bpt4UsdxBalance < usdxAmount) usdxAmount = bpt4UsdxBalance;

        bytes32 poolId = pool.getPoolId();

        (IAsset[] memory assets, , ) = vault.getPoolTokens(poolId);

        uint256[] memory amounts = new uint256[](5);
        amounts[1] = usdxAmount;

        uint256[] memory userDataAmounts = new uint256[](4);
        userDataAmounts[0] = usdxAmount;

        uint256 bpt4AmountIn = usdxAmount * 1e12 / pool.getRate();
        uint maxAmountIn = bpt4AmountIn * (1e6 + slippage) / 1e6;
        bytes memory userData = abi.encode(ExitKind.BPT_IN_FOR_EXACT_TOKENS_OUT, userDataAmounts, maxAmountIn);

        ExitPoolRequest memory request = ExitPoolRequest(assets, amounts, userData, false);

        vault.exitPool(poolId, address(this), address(this), request);

        emit Divested(usdxAmount);

        return usdxAmount;
    }

}

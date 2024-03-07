// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== AuraAsset.sol ===========================
// ====================================================================

/**
 * @title Aura Asset
 * @dev Representation of an on-chain investment on Aura finance.
 */

import { IDepositWrapper, IBaseRewardPool } from "./Interfaces/Aura/IAura.sol";
import { Stabilizer, IERC20Metadata, IAMM, TransferHelper, OvnMath } from "../Stabilizer/Stabilizer.sol";
import { IBalancerPool, IBalancerVault, JoinKind, ExitKind, IAsset, IWeightedPoolLib } from "./Interfaces/Balancer/IBalancer.sol";

contract AuraAsset is Stabilizer {

    error UnexpectedAmount();

    // Variables
    IBaseRewardPool private immutable asset;
    IDepositWrapper private immutable depositor;
    IBalancerPool private immutable balancerPool;
    IWeightedPoolLib private immutable quoterLirary;

    uint256 private constant usdxIndex = 1;

    uint24 private constant PRECISION = 1e6;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _depositor,
        address _asset,
        address _balancerPool,
        address _quoterLirary,
        address _oracleUsdx,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        depositor = IDepositWrapper(_depositor);
        asset = IBaseRewardPool(_asset);
        balancerPool = IBalancerPool(_balancerPool);
        quoterLirary = IWeightedPoolLib(_quoterLirary);
    }

    /* ========== Views ========== */

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     */
    function assetValue() public view override returns (uint256) {
        uint256 bptBalance = asset.convertToAssets(asset.balanceOf(address(this)));
        if(bptBalance == 0) return 0;

        IBalancerVault vault = IBalancerVault(balancerPool.getVault());
        (, uint256[] memory balances, ) = vault.getPoolTokens(balancerPool.getPoolId());
        uint256[] memory normalizedWeights = balancerPool.getNormalizedWeights();
        uint256 totalSupply = balancerPool.totalSupply();
        uint256 swapFeePercentage = balancerPool.getSwapFeePercentage();

        bytes memory userData = abi.encode(ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, bptBalance, 1);

        (, uint256[] memory tokensOut) = quoterLirary.exitExactBPTInForTokenOut(
                balances,
                normalizedWeights,
                totalSupply,
                swapFeePercentage,
                userData
            );

        return _oracleUsdxToUsd(tokensOut[1]);
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest.
     * @param usdxAmount Amount of usdx to be swapped for token.
     * @dev Swap from usdx to token.
     */
    function invest(uint256 usdxAmount, uint256 slippage) 
        external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount)
    {
        _invest(usdxAmount, 0, slippage);
    }

    /**
     * @notice Divest.
     * @param usdxAmount Amount to be divested.
     * @dev Swap from the token to usdx.
     */
    function divest(uint256 usdxAmount, uint256 slippage)
        external onlyBorrower nonReentrant validAmount(usdxAmount)
    {
        _divest(usdxAmount, slippage);
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external nonReentrant {
        if(auctionAllowed) revert ActionNotAllowed();
        _liquidate(_getToken(), getDebt());
    }

    /* ========== Internals ========== */

    function _getToken() internal view override returns (address) {
        return address(asset);
    }

    function _invest(uint256 usdxAmount, uint256, uint256 minBPTout)
        internal override 
    {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        IBalancerVault vault = IBalancerVault(balancerPool.getVault());
        (IAsset[] memory poolAssets, , ) = vault.getPoolTokens(balancerPool.getPoolId());

        uint256[] memory amounts = new uint256[](3);
        amounts[usdxIndex] = usdxAmount;

        uint256[] memory userDataAmounts = new uint256[](3);
        userDataAmounts[usdxIndex] = usdxAmount;

        bytes memory userData = abi.encode(JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, userDataAmounts, minBPTout);
        IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest(poolAssets, amounts, userData, false);

        TransferHelper.safeApprove(address(usdx), address(depositor), usdxAmount);
        depositor.depositSingle(
            address(asset),
            address(usdx),
            usdxAmount,
            balancerPool.getPoolId(),
            request
        );

        emit Invested(usdxAmount);
    }

    function _divest(uint256, uint256 minUSDCOut) internal override  {
        uint256 assetsAmount = asset.balanceOf(address(this));
        // withdraw from SILO
        asset.withdrawAndUnwrap(assetsAmount, true);
        
        uint256 bptAmount = balancerPool.balanceOf(address(this));
        
        IBalancerVault vault = IBalancerVault(balancerPool.getVault());
        (IAsset[] memory poolAssets, , ) = vault.getPoolTokens(balancerPool.getPoolId());

        uint256[] memory amounts = new uint256[](3);
        amounts[usdxIndex] = minUSDCOut;

        bytes memory userData = abi.encode(ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, bptAmount, usdxIndex);
        IBalancerVault.ExitPoolRequest memory request = IBalancerVault.ExitPoolRequest(poolAssets, amounts, userData, false);

        uint256 usdcBefore = usdx.balanceOf(address(this));
        vault.exitPool(balancerPool.getPoolId(), address(this), address(this), request);
        uint256 usdcAfter = usdx.balanceOf(address(this));

        emit Divested(usdcAfter - usdcBefore);
    }

    function collect() external onlyBorrower nonReentrant {
        asset.getReward();
    }
}

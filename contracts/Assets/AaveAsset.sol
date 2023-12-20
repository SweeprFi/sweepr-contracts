// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= AaveAsset.sol ==========================
// ====================================================================

/**
 * @title Aave V3 Asset
 * @dev Representation of an on-chain investment on a Aave pool
 * Intergrated with V3
 */

import { IERC20Metadata } from "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";
import { TransferHelper } from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import { Stabilizer, OvnMath } from "../Stabilizer/Stabilizer.sol";
import { IPool } from "./Interfaces/Aave/IAaveV3Pool.sol";
import { IBalancerPool, IBalancerVault, SingleSwap, SwapKind, IAsset, FundManagement } from "./Interfaces/Balancer/IBalancer.sol";

contract AaveAsset is Stabilizer {
    IERC20 private immutable aaveUsdx;
    IPool private immutable aaveV3Pool;

    uint16 private constant DEADLINE_GAP = 15 minutes;

    // Variables
    IERC20Metadata private immutable usdc_e;
    IBalancerPool private immutable pool;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _usdc_e,
        address _pool,
        address _aaveUsdx,
        address _aaveV3Pool,
        address _oracleUsdx,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        aaveUsdx = IERC20(_aaveUsdx); //aaveUSDC
        aaveV3Pool = IPool(_aaveV3Pool);
        usdc_e = IERC20Metadata(_usdc_e);
        pool = IBalancerPool(_pool);
    }

    /* ========== Views ========== */

    /**
     * @notice Get Asset Value
     * @return uint256 Asset Amount.
     * @dev the invested amount in USDX on the Aave V3 pool.
     */
    function assetValue() public view override returns (uint256) {
        uint256 aaveUsdxBalance = aaveUsdx.balanceOf(address(this));
        // All numbers given are in USDX unless otherwise stated
        return _oracleUsdxToUsd(aaveUsdxBalance);
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest USDX
     * @param usdxAmount USDX Amount to be invested.
     * @dev Sends balance to Aave V3.
     */
    function invest(uint256 usdxAmount, uint256 slippage) 
        external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount)
    {
        _invest(usdxAmount, 0, slippage);
    }

    /**
     * @notice Divests From Aave.
     * @param usdxAmount Amount to be divested.
     * @dev Sends balance from the Aave V3 pool to the Asset.
     */
    function divest(uint256 usdxAmount, uint256 slippage)
        external onlyBorrower nonReentrant validAmount(usdxAmount)
    {
        _divest(usdxAmount, slippage);
    }

    function liquidate() external nonReentrant {
        if(auctionAllowed) revert ActionNotAllowed();
        _liquidate(_getToken(), getDebt());
    }

    /* ========== Internals ========== */

    function _getToken() internal view override returns (address) {
        return address(aaveUsdx);
    }

    /**
     * @notice Invest
     * @dev Deposits the amount into the Aave V3 pool.
     */
    function _invest(uint256 usdxAmount, uint256, uint256 slippage) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        // Swap USDC to USDC.e
        uint256 minAmountOut = OvnMath.subBasisPoints(usdxAmount, slippage);
        uint256 usdceAmount = swap(address(usdx), address(usdc_e), usdxAmount, minAmountOut);

        TransferHelper.safeApprove(address(usdc_e), address(aaveV3Pool), usdceAmount);
        aaveV3Pool.supply(address(usdc_e), usdceAmount, address(this), 0);

        emit Invested(usdxAmount);
    }

    /**
     * @notice Divest
     * @dev Withdraws the amount from the Aave V3 pool.
     */
    function _divest(uint256 usdxAmount, uint256 slippage) internal override {
        if (aaveUsdx.balanceOf(address(this)) < usdxAmount)
            usdxAmount = type(uint256).max;
        uint256 divestedAmount = aaveV3Pool.withdraw(address(usdc_e), usdxAmount, address(this));
        // Swap USDC.e to USDC
        uint256 minAmountOut = OvnMath.subBasisPoints(divestedAmount, slippage);
        divestedAmount = swap(address(usdc_e), address(usdx), divestedAmount, minAmountOut);

        emit Divested(divestedAmount);
    }

    /**
     * @notice Swap tokenIn for tokenOut using balancer exact input swap
     * @param tokenIn Address to in
     * @param tokenOut Address to out
     * @param amountIn Amount of _tokenA
     * @param amountOutMin Minimum amount out.
     */
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin
    ) internal returns (uint256 amountOut) {
        bytes32 poolId = pool.getPoolId();
        address vaultAddress = pool.getVault();

        TransferHelper.safeApprove(tokenIn, vaultAddress, amountIn);

        bytes memory userData;
        SingleSwap memory singleSwap = SingleSwap(
            poolId,
            SwapKind.GIVEN_IN,
            IAsset(tokenIn),
            IAsset(tokenOut),
            amountIn,
            userData
        );

        FundManagement memory funds = FundManagement(address(this), false, payable(address(this)), false);
        uint256 deadline = block.timestamp + DEADLINE_GAP;

        amountOut = IBalancerVault(vaultAddress).swap(singleSwap, funds, amountOutMin, deadline);
    }
}

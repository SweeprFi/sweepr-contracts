// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== SiloAsset.sol ===========================
// ====================================================================

/**
 * @title USDPlus Asset
 * @dev Representation of an on-chain investment on Overnight finance.
 */

import { Stabilizer, IERC20Metadata, IAMM, TransferHelper, OvnMath } from "../Stabilizer/Stabilizer.sol";
import { ISilo, ISiloLens } from "./Interfaces/Silo/ISilo.sol";
import { IBalancerPool, IBalancerVault, SingleSwap, SwapKind, IAsset, FundManagement } from "./Interfaces/Balancer/IBalancer.sol";

contract SiloAsset is Stabilizer {

    error UnexpectedAmount();
    uint16 private constant DEADLINE_GAP = 15 minutes;

    // Variables    
    IERC20Metadata private immutable usdc_e;

    ISilo private immutable silo;
    ISiloLens private immutable lens;
    IBalancerPool private immutable pool;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _usdc_e,
        address _silo,
        address _lens,
        address _oracleUsdx,
        address _borrower,
        address _pool
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        usdc_e = IERC20Metadata(_usdc_e);
        silo = ISilo(_silo);
        lens = ISiloLens(_lens);
        pool = IBalancerPool(_pool);
    }

    /* ========== Views ========== */

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     */
    function assetValue() public view override returns (uint256) {
        return _oracleUsdxToUsd(getDepositAmount());
    }

    function getDepositAmount() public view returns (uint256) {
        return lens.getDepositAmount(address(silo), address(usdc_e), address(this), block.timestamp);
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
        returns (uint256)
    {
        return _divest(usdxAmount, slippage);
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external nonReentrant {
        if(auctionAllowed) revert ActionNotAllowed();
        
        // _liquidate(address(usdc_e), getDebt());
        // liquidation is a divest followed by sending tokens to the liquidator
        // silo does not provite a token
    }

    /* ========== Internals ========== */

    function _getToken() internal view override returns (address) {
        return address(usdc_e);
    }

    function _invest(uint256 usdxAmount, uint256, uint256 slippage)
        internal override 
    {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        // Swap native USDx to USDC.e
        uint256 usdceAmount = swap(
            address(usdx),
            address(usdc_e),
            usdxAmount,
            OvnMath.subBasisPoints(usdxAmount, slippage)
        );

        TransferHelper.safeApprove(address(usdc_e), address(silo), usdceAmount);
        (uint256 collateralAmount,) = silo.deposit(address(usdc_e), usdceAmount, false);

        if(collateralAmount < usdceAmount) {
            revert UnexpectedAmount();
        }

        emit Invested(usdceAmount);
    }

    function _divest(
        uint256 usdxAmount,
        uint256 slippage
    ) internal override returns (uint256 divestedAmount) {
        uint256 depositedAmount = getDepositAmount();
        if(depositedAmount < usdxAmount) usdxAmount = depositedAmount;

        // withdraw from SILO
        (uint256 withdrawnAmount,) = silo.withdraw(address(usdc_e), usdxAmount, false);
        // Check return amount
        if(withdrawnAmount < usdxAmount) {
            revert UnexpectedAmount();
        }

        // Swap native USDC.e to USDx
        divestedAmount = swap(
            address(usdc_e),
            address(usdx),
            usdxAmount,
            OvnMath.subBasisPoints(usdxAmount, slippage)
        );

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
    ) public returns (uint256 amountOut) {
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

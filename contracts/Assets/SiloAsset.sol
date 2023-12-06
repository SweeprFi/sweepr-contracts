// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== SiloAsset.sol ===========================
// ====================================================================

/**
 * @title Silo Asset
 * @dev Representation of an on-chain investment on Overnight finance.
 */

import { Stabilizer, IERC20Metadata, IAMM, TransferHelper, OvnMath } from "../Stabilizer/Stabilizer.sol";
import { ISilo, ISiloLens, ISiloIncentives } from "./Interfaces/Silo/ISilo.sol";
import { IBalancerPool, IBalancerVault, SingleSwap, SwapKind, IAsset, FundManagement } from "./Interfaces/Balancer/IBalancer.sol";

contract SiloAsset is Stabilizer {

    error UnexpectedAmount();
    uint16 private constant DEADLINE_GAP = 15 minutes;

    // Variables
    IERC20Metadata private immutable usdc_e;
    IBalancerPool private immutable pool;

    ISilo private constant silo = ISilo(0xA8897b4552c075e884BDB8e7b704eB10DB29BF0D);
    ISiloLens private immutable lens = ISiloLens(0xBDb843c7a7e48Dc543424474d7Aa63b61B5D9536);
    IERC20Metadata private immutable shares = IERC20Metadata(0x713fc13CaAB628F116Bc34961f22a6B44aD27668);
    ISiloIncentives private immutable incentives = ISiloIncentives(0xd592F705bDC8C1B439Bd4D665Ed99C4FaAd5A680);

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _usdc_e,
        address _oracleUsdx,
        address _borrower,
        address _pool
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        usdc_e = IERC20Metadata(_usdc_e);
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
        _liquidate(_getToken(), getDebt());
    }

    function collect() external nonReentrant onlyBorrower {
        address[] memory assets = new address[](1);
        assets[0] = address(shares);
        uint256 amount = incentives.getRewardsBalance(assets, address(this));
        incentives.claimRewardsToSelf(assets, amount);
    }

    /* ========== Internals ========== */

    function _getToken() internal view override returns (address) {
        return address(shares);
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

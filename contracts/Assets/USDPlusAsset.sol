// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== USDPlusAsset.sol ========================
// ====================================================================

/**
 * @title USDPlus Asset
 * @dev Representation of an on-chain investment on Overnight finance.
 */

import "../Stabilizer/Stabilizer.sol";
import "./Interfaces/Overnight/IExchanger.sol";
import { IBalancerPool, IBalancerVault, SingleSwap, SwapKind, IAsset, FundManagement } from "./Interfaces/Balancer/IBalancer.sol";

contract USDPlusAsset is Stabilizer {
    uint16 private constant DEADLINE_GAP = 15 minutes;
    // Variables
    IERC20Metadata private immutable token;
    IERC20Metadata private immutable usdc_e; // Arbitrum USDC.e
    IExchanger private immutable exchanger;
    IBalancerPool private immutable pool;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    // Errors
    error UnExpectedAmount();

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _token,
        address _usdc_e,
        address _exchanger,
        address _oracleUsdx,
        address _borrower,
        address _pool
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        token = IERC20Metadata(_token);
        usdc_e = IERC20Metadata(_usdc_e);
        exchanger = IExchanger(_exchanger);
        pool = IBalancerPool(_pool);
    }

    /* ========== Views ========== */

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     */
    function assetValue() public view override returns (uint256) {
        uint256 tokenBalance = token.balanceOf(address(this));
        uint256 redeemFee = exchanger.redeemFee();
        uint256 redeemFeeDenominator = exchanger.redeemFeeDenominator();
        uint256 tokenInUsdx = _tokenToUsdx(tokenBalance);
        uint256 usdxAmount = (tokenInUsdx *
            (redeemFeeDenominator - redeemFee)) / redeemFeeDenominator;

        return _oracleUsdxToUsd(usdxAmount);
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest.
     * @param usdxAmount Amount of usdx to be swapped for token.
     * @param slippage .
     * @dev Swap from usdx to token.
     */
    function invest(
        uint256 usdxAmount,
        uint256 slippage
    ) external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount) {
        _invest(usdxAmount, 0, slippage);
    }

    /**
     * @notice Divest.
     * @param usdxAmount Amount to be divested.
     * @param slippage .
     * @dev Swap from the token to usdx.
     */
    function divest(
        uint256 usdxAmount,
        uint256 slippage
    )
        external
        onlyBorrower
        nonReentrant
        validAmount(usdxAmount)
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
        return address(token);
    }

    function _invest(
        uint256 usdxAmount,
        uint256,
        uint256 slippage
    ) internal override {
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

        // Invest to USD+
        uint256 estimatedAmount = _usdxToToken(
            OvnMath.subBasisPoints(usdceAmount, slippage)
        );
        TransferHelper.safeApprove(
            address(usdc_e),
            address(exchanger),
            usdceAmount
        );
        uint256 tokenAmount = exchanger.mint(
            IExchanger.MintParams(address(usdc_e), usdceAmount, "")
        );
        if (tokenAmount == 0 || tokenAmount < estimatedAmount)
            revert UnExpectedAmount();

        emit Invested(_tokenToUsdx(tokenAmount));
    }

    function _divest(
        uint256 usdxAmount,
        uint256 slippage
    ) internal override {
        uint256 tokenBalance = token.balanceOf(address(this));
        if (tokenBalance == 0) revert NotEnoughBalance();
        uint256 tokenAmount = _usdxToToken(usdxAmount);
        if (tokenBalance < tokenAmount) tokenAmount = tokenBalance;

        // Redeem
        uint256 usdceAmount = exchanger.redeem(address(usdc_e), tokenAmount);

        // Check return amount
        uint256 estimatedAmount = _tokenToUsdx(
            OvnMath.subBasisPoints(tokenAmount, slippage)
        );
        if (usdceAmount < estimatedAmount) revert UnExpectedAmount();

        // Swap native USDC.e to USDx
        uint256 divestedAmount = swap(
            address(usdc_e),
            address(usdx),
            usdceAmount,
            OvnMath.subBasisPoints(usdceAmount, slippage)
        );

        emit Divested(divestedAmount);
    }

    /**
     * @notice Convert Usdx to Token (1:1 rate)
     */
    function _tokenToUsdx(uint256 tokenAmount) internal view returns (uint256) {
        return
            (tokenAmount * (10 ** usdx.decimals())) / (10 ** token.decimals());
    }

    /**
     * @notice Convert Token to Usdx (1:1 rate)
     */
    function _usdxToToken(uint256 usdxAmount) internal view returns (uint256) {
        return
            (usdxAmount * (10 ** token.decimals())) / (10 ** usdx.decimals());
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

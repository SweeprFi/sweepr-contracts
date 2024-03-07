// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== EthenaAsset.sol =========================
// ====================================================================

import { ISUSDe } from "./Interfaces/Ethena/IEthena.sol";
import { ICurvePool } from "./Interfaces/Curve/ICurve.sol";
import { Stabilizer, OvnMath, TransferHelper, IERC20Metadata } from "../Stabilizer/Stabilizer.sol";

contract EthenaAsset is Stabilizer {

    // Variables
    ICurvePool public pool;
    ISUSDe public immutable asset;
    IERC20Metadata private immutable usde;

    mapping(address => uint8) public assetIndex;
    uint8 public constant USDe_IDX = 0;
    uint8 public constant USDC_IDX = 1;

    // Events
    event Invested(uint256 indexed tokenAmount);
    event Divested(uint256 indexed usdxAmount);

    error UnexpectedAmount();
    error OperationNotAllowed();

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _usde,
        address _asset,
        address _oracleUsdx,
        address poolAddress,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        asset = ISUSDe(_asset);
        usde = IERC20Metadata(_usde);
        pool = ICurvePool(poolAddress);

        assetIndex[_usdx] = USDC_IDX;
        assetIndex[_usde] = USDe_IDX;
    }

    /* ========== Views ========== */

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     * @dev the price is obtained from Chainlink
     */
    function assetValue() public view override returns (uint256) {
        uint256 sharesBalance = asset.balanceOf(address(this));
        uint256 assetsBalance = asset.convertToAssets(sharesBalance);
        assetsBalance = assetsBalance / (10 ** (usde.decimals() - usdx.decimals()));

        return _oracleUsdxToUsd(assetsBalance);
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest.
     * @param usdxAmount Amount of usdx to be invested
     * @dev Swap from usdx to USDe and stake.
     */
    function invest(uint256 usdxAmount, uint256 slippage)
        external
        onlyBorrower
        whenNotPaused
        nonReentrant
        validAmount(usdxAmount)
    {
        _invest(usdxAmount, 0, slippage);
    }

    /**
     * @notice Divest.
     * @param usdxAmount Amount to be divested.
     * @param slippage .
     * @dev Unsatke and swap from the token to usdx.
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

    function requestRedeem(uint256 usdxAmount)
        external
        onlyBorrower
        validAmount(usdxAmount)
    {
        if(asset.cooldownDuration() == 0) revert OperationNotAllowed();
        uint256 sharesAmount = _getShares(usdxAmount);

        asset.cooldownShares(sharesAmount);
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

    function _invest(uint256 usdxAmount, uint256, uint256 slippage) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        uint256 minAmountOut = OvnMath.subBasisPoints(usdxAmount, slippage);
        uint256 usdeAmount = swap(address(usdx), address(usde), usdxAmount, minAmountOut);

        TransferHelper.safeApprove(address(usde), address(asset), usdeAmount);
        uint256 shares = asset.deposit(usdeAmount, address(this));

        if(shares < asset.convertToShares(usdeAmount)) revert UnexpectedAmount();
        emit Invested(usdeAmount);
    }

    function _divest(uint256 usdxAmount, uint256 slippage) internal override {
        address self = address(this);
        (uint104 cooldownEnd, uint152 underlyingAmount) = asset.cooldowns(self);

        if(asset.cooldownDuration() > 0) {
            if(cooldownEnd == 0 || cooldownEnd >= block.timestamp) revert OperationNotAllowed();
            asset.unstake(self);
        } else {
            if(underlyingAmount > 0) asset.unstake(self);
            uint256 sharesAmount = _getShares(usdxAmount);
            asset.redeem(sharesAmount, self, self);
        }
        
        uint256 usdeBalance = usde.balanceOf(self);
        uint256 amountOutMin = OvnMath.subBasisPoints(usdeBalance, slippage);
        amountOutMin = (amountOutMin * (10 ** usdx.decimals())) / (10 ** usde.decimals());
        uint256 usdcAmount = swap(address(usde), address(usdx), usdeBalance, amountOutMin);

        emit Divested(usdcAmount);
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin) 
        internal returns (uint256 amountOut)
    {
        TransferHelper.safeApprove(tokenIn, address(pool), amountIn);

        amountOut = pool.exchange(
            int8(assetIndex[tokenIn]),
            int8(assetIndex[tokenOut]),
            amountIn,
            amountOutMin,
            address(this)
        );
    }

    function _getShares(uint256 usdxAmount) internal view returns (uint256 sharesAmount) {
        uint256 sharesBalance = asset.balanceOf(address(this));
        if (sharesBalance == 0) revert NotEnoughBalance();

        usdxAmount = (usdxAmount * (10 ** usde.decimals())) / (10 ** usdx.decimals());
        sharesAmount = asset.convertToShares(usdxAmount);
        if (sharesBalance < sharesAmount) sharesAmount = sharesBalance;
    }
}

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
import "./Overnight/IExchanger.sol";

contract USDPlusAsset is Stabilizer {
    // Variables
    IERC20Metadata private immutable token;
    IERC20Metadata private immutable usdcE; // Arbitrum USDC.e
    IExchanger private immutable exchanger;
    uint24 private immutable poolFee;

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
        address _usdcE,
        address _exchanger,
        address _oracleUsdx,
        address _borrower,
        uint24 _poolFee
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        token = IERC20Metadata(_token);
        usdcE = IERC20Metadata(_usdcE);
        exchanger = IExchanger(_exchanger);
        poolFee = _poolFee;
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
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     */
    function assetValue() public view returns (uint256) {
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
        returns (uint256)
    {
        return _divest(usdxAmount, slippage);
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external nonReentrant {
        _liquidate(address(token));
    }

    /* ========== Internals ========== */

    function _invest(
        uint256 usdxAmount,
        uint256,
        uint256 slippage
    ) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        // Swap native USDx to USDC.e
        IAMM _amm = amm();
        TransferHelper.safeApprove(address(usdx), address(_amm), usdxAmount);
        uint256 usdcEAmount = _amm.swapExactInput(
            address(usdx),
            address(usdcE),
            poolFee,
            usdxAmount,
            OvnMath.subBasisPoints(usdxAmount, slippage)
        );

        // Invest to USD+
        uint256 estimatedAmount = _usdxToToken(
            OvnMath.subBasisPoints(usdcEAmount, slippage)
        );
        TransferHelper.safeApprove(
            address(usdcE),
            address(exchanger),
            usdcEAmount
        );
        uint256 tokenAmount = exchanger.mint(
            IExchanger.MintParams(address(usdcE), usdcEAmount, "")
        );
        if (tokenAmount == 0 || tokenAmount < estimatedAmount)
            revert UnExpectedAmount();

        emit Invested(_tokenToUsdx(tokenAmount));
    }

    function _divest(
        uint256 usdxAmount,
        uint256 slippage
    ) internal override returns (uint256 divestedAmount) {
        uint256 tokenBalance = token.balanceOf(address(this));
        if (tokenBalance == 0) revert NotEnoughBalance();
        uint256 tokenAmount = _usdxToToken(usdxAmount);
        if (tokenBalance < tokenAmount) tokenAmount = tokenBalance;

        // Redeem
        uint256 usdcEAmount = exchanger.redeem(address(usdcE), tokenAmount);

        // Check return amount
        uint256 estimatedAmount = _tokenToUsdx(
            OvnMath.subBasisPoints(tokenAmount, slippage)
        );
        if (usdcEAmount < estimatedAmount) revert UnExpectedAmount();

        // Swap native USDC.e to USDx
        IAMM _amm = amm();
        TransferHelper.safeApprove(address(usdcE), address(_amm), usdcEAmount);
        divestedAmount = _amm.swapExactInput(
            address(usdcE),
            address(usdx),
            poolFee,
            usdcEAmount,
            OvnMath.subBasisPoints(usdcEAmount, slippage)
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
}

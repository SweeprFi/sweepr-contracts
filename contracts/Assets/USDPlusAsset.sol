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
    IExchanger private immutable exchanger;

    // Events
    event Invested(uint256 indexed tokenAmount);
    event Divested(uint256 indexed usdxAmount);

    // Errors
    error UnExpectedAmount();

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _token,
        address _exchanger,
        address _oracleUsdx,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        token = IERC20Metadata(_token);
        exchanger = IExchanger(_exchanger);
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

        TransferHelper.safeApprove(
            address(usdx),
            address(exchanger),
            usdxAmount
        );
        uint256 estimatedAmount = _usdxToToken(
            OvnMath.subBasisPoints(usdxAmount, slippage)
        );
        uint256 tokenAmount = exchanger.mint(
            IExchanger.MintParams(address(usdx), usdxAmount, "")
        );
        if (tokenAmount == 0 || tokenAmount < estimatedAmount)
            revert UnExpectedAmount();

        emit Invested(tokenAmount);
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
        divestedAmount = exchanger.redeem(address(usdx), tokenAmount);

        // Check return amount
        uint256 estimatedAmount = _tokenToUsdx(
            OvnMath.subBasisPoints(tokenAmount, slippage)
        );
        if (divestedAmount < estimatedAmount) revert UnExpectedAmount();

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

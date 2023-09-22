// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== TokenAsset.sol ==========================
// ====================================================================

/**
 * @title Token Asset
 * @dev Representation of an on-chain investment like Wrapped Ether, Wrapped Bitcoin ...
 */

import "../Stabilizer/Stabilizer.sol";

contract TokenAsset is Stabilizer {
    // Variables
    IERC20Metadata private immutable token;
    IPriceFeed private immutable oracleToken;
    uint24 private immutable poolFee;

    // Events
    event Invested(uint256 indexed tokenAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _token,
        address _oracleUsdx,
        address _oracleToken,
        address _borrower,
        uint24 _poolFee

    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        token = IERC20Metadata(_token);
        oracleToken = IPriceFeed(_oracleToken);
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
     * @dev the price is obtained from Chainlink
     */
    function assetValue() public view returns (uint256) {
        uint256 tokenBalance = token.balanceOf(address(this));
        // All numbers given are in USDX unless otherwise stated
        return _oracleTokenToUsd(tokenBalance);
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
        if(auctionAllowed) revert ActionNotAllowed();
        _liquidate(address(token), getDebt());
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

        IAMM _amm = amm();
        uint256 usdxInToken = _oracleUsdxToToken(usdxAmount);
        TransferHelper.safeApprove(address(usdx), address(_amm), usdxAmount);
        uint256 tokenAmount = _amm.swapExactInput(
            address(usdx),
            address(token),
            poolFee,
            usdxAmount,
            OvnMath.subBasisPoints(usdxInToken, slippage)
        );

        emit Invested(tokenAmount);
    }

    function _divest(
        uint256 usdxAmount,
        uint256 slippage
    ) internal override returns (uint256 divestedAmount) {
        uint256 tokenAmount = _oracleUsdxToToken(usdxAmount);
        uint256 tokenBalance = token.balanceOf(address(this));
        if (tokenBalance < tokenAmount) tokenAmount = tokenBalance;

        IAMM _amm = amm();
        uint256 tokenInUsdx = _oracleTokenToUsdx(tokenAmount);
        TransferHelper.safeApprove(address(token), address(_amm), tokenAmount);
        divestedAmount = _amm.swapExactInput(
            address(token),
            address(usdx),
            poolFee,
            tokenAmount,
            OvnMath.subBasisPoints(tokenInUsdx, slippage)
        );

        emit Divested(divestedAmount);
    }

    function _oracleTokenToUsd(
        uint256 tokenAmount
    ) internal view returns (uint256) {
        return
            ChainlinkLibrary.convertTokenToUsd(
                tokenAmount,
                token.decimals(),
                oracleToken
            );
    }

    function _oracleTokenToUsdx(
        uint256 tokenAmount
    ) internal view returns (uint256) {
        return
            ChainlinkLibrary.convertTokenToToken(
                tokenAmount,
                token.decimals(),
                usdx.decimals(),
                oracleToken,
                oracleUsdx
            );
    }

    function _oracleUsdxToToken(
        uint256 usdxAmount
    ) internal view returns (uint256) {
        return
            ChainlinkLibrary.convertTokenToToken(
                usdxAmount,
                usdx.decimals(),
                token.decimals(),
                oracleUsdx,
                oracleToken
            );
    }
}

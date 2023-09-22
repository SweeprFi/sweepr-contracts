// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== BackedAsset.sol =========================
// ====================================================================

/**
 * @title Backed Asset
 * @dev Representation of an on-chain investment on Backed Finance
 */

import "../Stabilizer/Stabilizer.sol";

contract BackedAsset is Stabilizer {
    // Variables
    IERC20Metadata private immutable token;
    IPriceFeed private immutable oracleToken;
    address private immutable minter;
    address private immutable redeemer;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _token,
        address _minter,
        address _redeemer,
        address _oracleUsdx,
        address _oracleToken,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        token = IERC20Metadata(_token);
        minter = _minter;
        redeemer = _redeemer;
        oracleToken = IPriceFeed(_oracleToken);
    }

    /* ========== Views ========== */

    /**
     * @notice Current Value of investment.
     * @return total with 6 decimal to be compatible with dollar coins.
     */
    function currentValue() public view override returns (uint256) {
        uint256 accruedFeeInUsd = sweep.convertToUSD(accruedFee());
        return assetValue() + super.currentValue() - accruedFeeInUsd;
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
     * @dev Swap from usdx to token.
     */
    function invest(
        uint256 usdxAmount
    ) external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount) {
        _invest(usdxAmount, 0, 0);
    }

    /**
     * @notice Divest.
     * @param usdxAmount Amount to be divested.
     * @dev Swap from the token to usdx.
     */
    function divest(
        uint256 usdxAmount
    )
        external
        onlyBorrower
        nonReentrant
        validAmount(usdxAmount)
        returns (uint256)
    {
        return _divest(usdxAmount, 0);
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

    function _invest(uint256 usdxAmount, uint256, uint256) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeTransfer(address(usdx), minter, usdxAmount);

        emit Invested(usdxAmount);
    }

    function _divest(
        uint256 usdxAmount,
        uint256
    ) internal override returns (uint256 divestedAmount) {
        uint256 tokenAmount = _oracleUsdxToToken(usdxAmount);
        uint256 tokenBalance = token.balanceOf(address(this));
        if (tokenBalance < tokenAmount) tokenAmount = tokenBalance;
        TransferHelper.safeTransfer(address(token), redeemer, tokenAmount);

        // Estimated amount because there are some delays to receive usdc from redeemer.
        divestedAmount = _oracleTokenToUsdx(tokenAmount);

        emit Divested(tokenAmount);
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
}

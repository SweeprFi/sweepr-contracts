// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== GmAsset.sol ==========================
// ====================================================================

/**
 * @title GM Asset
 * @dev Representation of an on-chain investment
 */

import {
    Stabilizer,
    IERC20Metadata
} from "../Stabilizer/Stabilizer.sol";

contract GmAsset is Stabilizer {
    // Variables
    IERC20Metadata private immutable token;
    // IPriceFeed private immutable oracleToken;

    // Events
    event Invested(uint256 indexed tokenAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _token,
        address _oracleUsdx,
        // address _oracleToken,
        address _borrower

    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        token = IERC20Metadata(_token);
        // oracleToken = IPriceFeed(_oracleToken);
    }

    /* ========== Views ========== */

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     * @dev the price is obtained from Chainlink
     */
    function assetValue() public view override returns (uint256) {
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
        uint256 usdxAmount,
        uint256
    ) external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount) {
        _invest(usdxAmount, 0, 0);
    }

    /**
     * @notice Divest.
     * @param usdxAmount Amount to be divested.
     * @dev Swap from the token to usdx.
     */
    function divest(
        uint256 usdxAmount,
        uint256
    )
        external
        onlyBorrower
        nonReentrant
        validAmount(usdxAmount)
    {
        _divest(usdxAmount, 0);
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
        uint256
    ) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        // uint256 usdxInToken = _oracleUsdxToToken(usdxAmount);
        
        // transfer to OrderVault
        // execute ExchangeRouter.createOrder
        // or ExchangeRouter.createDeposit
        // calculate tokenAmount out

        emit Invested(0); // tokenAmount out
    }

    function _divest(
        uint256 usdxAmount,
        uint256
    ) internal override {
        uint256 tokenAmount = _oracleUsdxToToken(usdxAmount);
        uint256 tokenBalance = token.balanceOf(address(this));
        if (tokenBalance < tokenAmount) tokenAmount = tokenBalance;

        // uint256 tokenInUsdx = _oracleTokenToUsdx(tokenAmount);

        // execute ExchangeRouter.createWithdrawal
        // calculate tokenAmount out

        emit Divested(usdxAmount);
    }

    function _oracleTokenToUsd(
        uint256 tokenAmount
    ) internal pure returns (uint256 amountOut) {
        uint256 price = 1; // get MarketUtils.MarketPrices indexTokenPrice
        uint256 usdDecimals = 6;
        uint256 priceOracleDecimals = 6; // find out
        uint256 tokenDecimals = 6; //find out
        amountOut = (tokenAmount * price * (10 ** usdDecimals)) / 10 ** (priceOracleDecimals + tokenDecimals);
    }

    function _oracleTokenToUsdx(
        uint256 tokenAmount
    ) internal pure returns (uint256 amountOut) {
        uint256 decimals0 = 6; // long
        uint256 decimals1 = 6; // short
        uint256 price0 = 1; // get MarketUtils.MarketPrices longTokenPrice
        uint256 price1 = 1; // get MarketUtils.MarketPrices shortTokenPrice
        amountOut = _oracleTokenToToken(
            tokenAmount,
            decimals0,
            decimals1,
            price0,
            price1
        );
    }

    function _oracleUsdxToToken(
        uint256 usdxAmount
    ) internal pure returns (uint256 amountOut) {
        uint256 decimals0 = 6; // short
        uint256 decimals1 = 6; // long
        uint256 price0 = 1; // get MarketUtils.MarketPrices shortTokenPrice
        uint256 price1 = 1; // get MarketUtils.MarketPrices longTokenPrice
        amountOut = _oracleTokenToToken(
            usdxAmount,
            decimals0,
            decimals1,
            price0,
            price1
        );
    }

    function _oracleTokenToToken(
        uint256 amount0,
        uint256 decimals0,
        uint256 decimals1,
        uint256 price0,
        uint256 price1
    ) internal pure returns(uint256 amountOut) {
        amountOut = (amount0 * price0 * (10 ** decimals1)) / (price1 * (10 ** decimals0));
    }
}

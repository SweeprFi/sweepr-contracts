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
import "../Oracle/ChainlinkPricer.sol";

contract BackedAsset is Stabilizer {
    // Variables
    IERC20Metadata private immutable token;
    address private immutable tokenOracle; // Oracle to fetch price token / base
    address private immutable mintAddress;
    address private immutable redeemAddress;

    // Zero value will avoid to check StalePrice.
    uint256 private constant TOKEN_FREQUENCY = 0;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory name,
        address sweepAddress,
        address usdxAddress,
        address tokenAddress,
        address mintAddress_,
        address redeemAddress_,
        address tokenOracleAddress,
        address borrower
    ) Stabilizer(name, sweepAddress, usdxAddress, borrower) {
        token = IERC20Metadata(tokenAddress);
        mintAddress = mintAddress_;
        redeemAddress = redeemAddress_;
        tokenOracle = tokenOracleAddress;
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
        (int256 price, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            tokenOracle,
            amm().sequencer(),
            TOKEN_FREQUENCY
        );

        uint256 usdxAmount = (tokenBalance *
            uint256(price) *
            10 ** usdx.decimals()) / (10 ** (token.decimals() + decimals));

        return usdxAmount;
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest.
     * @param usdxAmount Amount of usdx to be swapped for token.
     * @dev Swap from usdx to token.
     */
    function invest(
        uint256 usdxAmount
    ) external onlyBorrower whenNotPaused validAmount(usdxAmount) {
        _invest(usdxAmount, 0, 0);
    }

    /**
     * @notice Divest.
     * @param usdxAmount Amount to be divested.
     * @dev Swap from the token to usdx.
     */
    function divest(
        uint256 usdxAmount
    ) external onlyBorrower validAmount(usdxAmount) {
        _divest(usdxAmount, 0);
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external {
        _liquidate(address(token));
    }

    /* ========== Internals ========== */

    function _invest(uint256 usdxAmount, uint256, uint256) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeTransfer(address(usdx), mintAddress, usdxAmount);

        emit Invested(usdxAmount);
    }

    function _divest(uint256 usdxAmount, uint256) internal override {
        (int256 price, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            tokenOracle,
            amm().sequencer(),
            TOKEN_FREQUENCY
        );

        uint256 tokenAmount = (usdxAmount *
            (10 ** (token.decimals() + decimals))) /
            (uint256(price) * 10 ** usdx.decimals());

        uint256 tokenBalance = token.balanceOf(address(this));
        if (tokenBalance < tokenAmount) tokenAmount = tokenBalance;

        TransferHelper.safeTransfer(address(token), redeemAddress, tokenAmount);

        emit Divested(usdxAmount);
    }
}

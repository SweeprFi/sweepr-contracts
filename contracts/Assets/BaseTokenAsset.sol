// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== BaseTokenAsset.sol ======================
// ====================================================================

/**
 * @title Base Token Asset
 * @dev Representation of an on-chain investment
 */

import "../Stabilizer/Stabilizer.sol";

contract BaseTokenAsset is Stabilizer {
    // Variables
    IERC20Metadata private immutable token;
    IPriceFeed private immutable oracleToken;

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _token,
        address _oracleUsdx,
        address _oracleToken,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        token = IERC20Metadata(_token);
        oracleToken = IPriceFeed(_oracleToken);
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

    /* ========== Internals ========== */

    function _getToken() internal view override returns (address) {
        return address(token);
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
}

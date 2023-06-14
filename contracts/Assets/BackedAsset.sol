// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== BackedAsset.sol ==========================
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
    address private immutable token_oracle; // Oracle to fetch price token / base
    address private immutable mint_address;
    address private immutable redeem_address;

    // Zero value will avoid to check StalePrice.
    uint256 private constant TOKEN_FREQUENCY = 0;

    constructor(
        string memory _name,
        address _sweepAddress,
        address _usdx_address,
        address _token_address,
        address _mint_address,
        address _redeem_address,
        address _token_oracle_address,
        address _borrower
    )
        Stabilizer(
            _name,
            _sweepAddress,
            _usdx_address,
            _borrower
        )
    {
        token = IERC20Metadata(_token_address);
        mint_address = _mint_address;
        redeem_address = _redeem_address;
        token_oracle = _token_oracle_address;
    }

    /* ========== Views ========== */

    /**
     * @notice Current Value of investment.
     * @return total with 6 decimal to be compatible with dollar coins.
     */
    function currentValue() public view override returns (uint256) {
        return assetValue() + super.currentValue();
    }

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     * @dev the price is obtained from Chainlink
     */
    function assetValue() public view returns (uint256) {
        uint256 token_balance = token.balanceOf(address(this));
        (int256 price, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            token_oracle,
            amm().sequencer(),
            TOKEN_FREQUENCY
        );

        uint256 usdx_amount = (token_balance *
            uint256(price) *
            10 ** usdx.decimals()) / (10 ** (token.decimals() + decimals));

        return usdx_amount;
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest.
     * @param _usdx_amount Amount of usdx to be swapped for token.
     * @dev Swap from usdx to token.
     */
    function invest(
        uint256 _usdx_amount
    ) external onlyBorrower whenNotPaused validAmount(_usdx_amount) {
        _invest(_usdx_amount, 0);
    }

    /**
     * @notice Divest.
     * @param _usdx_amount Amount to be divested.
     * @dev Swap from the token to usdx.
     */
    function divest(
        uint256 _usdx_amount
    ) external onlyBorrower validAmount(_usdx_amount) {
        _divest(_usdx_amount);
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external {
        _liquidate(address(token));
    }

    /* ========== Internals ========== */

    function _invest(uint256 _usdx_amount, uint256) internal override {
        (uint256 usdx_balance, ) = _balances();
        if(usdx_balance < _usdx_amount) _usdx_amount = usdx_balance;

        TransferHelper.safeTransfer(address(usdx), mint_address, _usdx_amount);

        emit Invested(_usdx_amount, 0);
    }

    function _divest(uint256 _usdx_amount) internal override {
        (int256 price, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            token_oracle,
            amm().sequencer(),
            TOKEN_FREQUENCY
        );

        uint256 token_amount = (_usdx_amount *
            (10 ** (token.decimals() + decimals))) /
            (uint256(price) * 10 ** usdx.decimals());

        uint256 token_balance = token.balanceOf(address(this));
        if(token_balance < token_amount) token_amount = token_balance;

        TransferHelper.safeTransfer(address(token), redeem_address, token_amount);

        emit Divested(_usdx_amount, 0);
    }
}

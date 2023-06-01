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
import "../Oracle/ChainlinkPricer.sol";

contract TokenAsset is Stabilizer {
    // Variables
    IERC20Metadata private immutable token;

    // Oracle to fetch price token / base
    address private immutable token_oracle;

    // WETH and WBTC has the same frequency - check others
    uint256 private constant TOKEN_FREQUENCY = 1 days;

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _token_address,
        address _token_oracle_address,
        address _borrower
    )
        Stabilizer(
            _name,
            _sweep_address,
            _usdx_address,
            _borrower
        )
    {
        token = IERC20Metadata(_token_address);
        token_oracle = _token_oracle_address;
    }

    /* ========== Views ========== */

    /**
     * @notice Current Value of investment.
     * @return total with 6 decimal to be compatible with dollar coins.
     */
    function currentValue() public view override returns (uint256) {
        uint256 accrued_fee_in_usd = SWEEP.convertToUSD(accruedFee());
        return assetValue() + super.currentValue() - accrued_fee_in_usd;
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

        TransferHelper.safeApprove(address(usdx), SWEEP.amm(), _usdx_amount);
        uint256 investedAmount = amm().swapExactInput(address(usdx), address(token), _usdx_amount, 0);

        emit Invested(investedAmount, 0);
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

        TransferHelper.safeApprove(address(token), SWEEP.amm(), token_amount);
        uint256 usdx_amount = amm().swapExactInput(
            address(token),
            address(usdx),
            token_amount,
            0
        );

        emit Divested(usdx_amount, 0);
    }
}

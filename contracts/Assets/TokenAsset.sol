// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;
pragma experimental ABIEncoderV2;

// ====================================================================
// ========================== TokenAsset.sol ==========================
// ====================================================================

/**
 * @title Token Asset
 * @dev Representation of an on-chain investment like Wrapped Ether, Wrapped Bitcoin ...
 */

import "../Stabilizer/Stabilizer.sol";
import "../Oracle/AggregatorV3Interface.sol";

contract TokenAsset is Stabilizer {
    // Variables
    IERC20Metadata public token;

    // Oracle to fetch price token / base
    AggregatorV3Interface private immutable token_oracle;

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _token_address,
        address _token_oracle_address,
        address _amm_address,
        address _borrower,
        address _usd_oracle_address
    )
        Stabilizer(
            _name,
            _sweep_address,
            _usdx_address,
            _amm_address,
            _borrower,
            _usd_oracle_address
        )
    {
        token = IERC20Metadata(_token_address);
        token_oracle = AggregatorV3Interface(_token_oracle_address);
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
        (, int256 price, , uint256 updatedAt, ) = token_oracle.latestRoundData();

        if(price == 0) revert ZeroPrice();
        if(updatedAt < block.timestamp - 1 hours) revert StalePrice();

        uint256 usdx_amount = (token_balance *
            uint256(price) *
            10 ** usdx.decimals()) /
            (10 ** (token.decimals() + token_oracle.decimals()));

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
    ) external onlyBorrower notFrozen validAmount(_usdx_amount) {
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
        _usdx_amount = _min(_usdx_amount, usdx_balance);

        TransferHelper.safeApprove(address(usdx), address(amm), _usdx_amount);
        amm.swapExactInput(address(usdx), address(token), _usdx_amount, 0);

        emit Invested(_usdx_amount, 0);
    }

    function _divest(uint256 _usdx_amount) internal override {
        (, int256 price, , uint256 updatedAt, ) = token_oracle.latestRoundData();

        if(price == 0) revert ZeroPrice();
        if(updatedAt < block.timestamp - 1 hours) revert StalePrice();

        uint256 token_amount = (_usdx_amount *
            (10 ** (token.decimals() + token_oracle.decimals()))) /
            (uint256(price) * 10 ** usdx.decimals());

        uint256 token_balance = token.balanceOf(address(this));
        token_amount = _min(token_amount, token_balance);

        TransferHelper.safeApprove(address(token), address(amm), token_amount);
        uint256 usdx_amount = amm.swapExactInput(
            address(token),
            address(usdx),
            token_amount,
            0
        );

        emit Divested(usdx_amount, 0);
    }
}

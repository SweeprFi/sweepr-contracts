// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== USDPlusAsset.sol ==========================
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

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _token,
        address _exchanger,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _borrower) {
        token = IERC20Metadata(_token);
        exchanger = IExchanger(_exchanger);
    }

    /* ========== Views ========== */

    /**
     * @notice Current Value of investment.
     * @return total with 6 decimal to be compatible with dollar coins.
     */
    function currentValue() public view override returns (uint256) {
        uint256 accruedFeeInUSD = SWEEP.convertToUSD(accruedFee());
        return assetValue() + super.currentValue() - accruedFeeInUSD;
    }

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     */
    function assetValue() public view returns (uint256) {
        uint256 tokenBalance = token.balanceOf(address(this));

        uint256 usdxAmount = (tokenBalance * 10 ** usdx.decimals()) /
            10 ** token.decimals();

        return usdxAmount;
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest.
     * @param _usdxAmount Amount of usdx to be swapped for token.
     * @dev Swap from usdx to token.
     */
    function invest(
        uint256 _usdxAmount
    ) external onlyBorrower whenNotPaused validAmount(_usdxAmount) {
        _invest(_usdxAmount, 0);
    }

    /**
     * @notice Divest.
     * @param _usdxAmount Amount to be divested.
     * @dev Swap from the token to usdx.
     */
    function divest(
        uint256 _usdxAmount
    ) external onlyBorrower validAmount(_usdxAmount) {
        _divest(_usdxAmount);
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external {
        _liquidate(address(token));
    }

    /* ========== Internals ========== */

    function _invest(uint256 _usdxAmount, uint256) internal override {
        (uint256 usdxBalance, ) = _balances();
        if (usdxBalance < _usdxAmount) _usdxAmount = usdxBalance;

        TransferHelper.safeApprove(
            address(usdx),
            address(exchanger),
            _usdxAmount
        );

        exchanger.mint(IExchanger.MintParams(address(usdx), _usdxAmount, ""));

        emit Invested(_usdxAmount, 0);
    }

    function _divest(uint256 _usdxAmount) internal override {
        uint256 tokenAmount = (_usdxAmount * 10 ** token.decimals()) /
            10 ** usdx.decimals();

        uint256 tokenBalance = token.balanceOf(address(this));
        if (tokenBalance < tokenAmount) tokenAmount = tokenBalance;

        uint256 usdxAmount = exchanger.redeem(address(token), tokenAmount);

        emit Divested(usdxAmount, 0);
    }
}

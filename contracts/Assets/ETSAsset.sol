// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== ETSAsset.sol ==========================
// ====================================================================

/**
 * @title ETS Asset
 * @dev Representation of an on-chain investment on Overnight finance.
 */

import "../Stabilizer/Stabilizer.sol";
import "./Overnight/IHedgeExchanger.sol";

contract ETSAsset is Stabilizer {
    // Variables
    IERC20Metadata private immutable token;
    IHedgeExchanger private immutable exchanger;

    // Events
    event Invested(uint256 indexed tokenAmount);
    event Divested(uint256 indexed usdxAmount);

    // Errors
    error NotAvailableInvest();
    error NotAvailableDivest();

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
        exchanger = IHedgeExchanger(_exchanger);
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
        if (redeemFee < redeemFeeDenominator) {
            tokenBalance =
                (tokenBalance * (redeemFeeDenominator - redeemFee)) /
                redeemFeeDenominator;
        }

        uint256 usdxAmount = (tokenBalance * 10 ** usdx.decimals()) /
            10 ** token.decimals();

        return _oracleUsdxToUsd(usdxAmount);
    }

    /**
     * @notice Check mint/redeem status from overnight.
     * @return mintable True: invest is possible, False: can't invest
     * @return redeemable True: divest is possibe, False: can't divest
     */
    function status() public view returns (bool mintable, bool redeemable) {
        mintable = exchanger.buyFee() < exchanger.buyFeeDenominator();
        redeemable = exchanger.redeemFee() < exchanger.redeemFeeDenominator();
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
        if(auctionAllowed) revert NotAllowedAction();
        _liquidate(address(token), getDebt());
    }

    /* ========== Internals ========== */

    function _getToken() internal view override returns (address) {
        return address(token);
    }

    function _invest(uint256 usdxAmount, uint256, uint256) internal override {
        (bool mintable, ) = status();
        if (!mintable) revert NotAvailableInvest();

        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(
            address(usdx),
            address(exchanger),
            usdxAmount
        );
        uint256 tokenAmount = exchanger.buy(usdxAmount, "");

        emit Invested(tokenAmount);
    }

    function _divest(
        uint256 usdxAmount,
        uint256
    ) internal override returns (uint256 divestedAmount) {
        (, bool redeemable) = status();
        if (!redeemable) revert NotAvailableDivest();

        uint256 tokenAmount = (usdxAmount * 10 ** token.decimals()) /
            10 ** usdx.decimals();
        uint256 tokenBalance = token.balanceOf(address(this));
        if (tokenBalance < tokenAmount) tokenAmount = tokenBalance;
        divestedAmount = exchanger.redeem(tokenAmount);

        emit Divested(divestedAmount);
    }
}

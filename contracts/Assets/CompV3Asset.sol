// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= CompV3Asset.sol ==========================
// ====================================================================

import "./Compound/IcUSDC.sol";
import "../Stabilizer/Stabilizer.sol";

/**
 * @title Compound V3 Asset
 * @dev Representation of an on-chain investment on a Compound V3
 */

contract CompV3Asset is Stabilizer {
    // Variables
    IcUSDC private immutable cUsdc;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _cUsdc,
        address _oracleUsdx,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        cUsdc = IcUSDC(_cUsdc);
    }

    /* ========== Views ========== */

    /**
     * @notice Current Value
     * @return total with 6 decimal to be compatible with dollar coins.
     */
    function currentValue() public view override returns (uint256) {
        uint256 accruedFeeInUsd = sweep.convertToUSD(accruedFee());
        return assetValue() + super.currentValue() - accruedFeeInUsd;
    }

    /**
     * @notice Current Value of investment.
     * @return the asset value
     * @dev the value of investment is calculated from cUsdc balance.
     */
    function assetValue() public view returns (uint256) {
        uint256 cUsdcBalance = cUsdc.balanceOf(address(this));
        // All numbers given are in USDX unless otherwise stated
        return _oracleUsdxToUsd(cUsdcBalance);
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest stable coins into Compound to get back cUsdc.
     * @param usdxAmount Amount of usdx to be deposited and minted in cUsdc.
     * @dev the amount deposited will generate rewards in Compound token.
     */
    function invest(
        uint256 usdxAmount
    ) external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount) {
        _invest(usdxAmount, 0, 0);
    }

    /**
     * @notice Divests From Compound.
     * @param usdxAmount Amount to be divested.
     * @dev first redeem from cUsdc and then transfer obtained to message sender.
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
        _liquidate(address(cUsdc), getDebt());
    }

    /* ========== Internals ========== */

    function _getToken() internal view override returns (address) {
        return address(cUsdc);
    }

    function _invest(uint256 usdxAmount, uint256, uint256) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(address(usdx), address(cUsdc), usdxAmount);
        cUsdc.supply(address(usdx), usdxAmount);

        emit Invested(usdxAmount);
    }

    function _divest(
        uint256 usdxAmount,
        uint256
    ) internal override returns (uint256 divestedAmount) {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        uint256 cUsdcBalance = cUsdc.balanceOf(address(this));
        if (cUsdcBalance < usdxAmount) usdxAmount = type(uint256).max;
        cUsdc.withdraw(address(usdx), usdxAmount);
        divestedAmount = usdx.balanceOf(address(this)) - usdxBalance;

        emit Divested(divestedAmount);
    }
}

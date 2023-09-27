// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== ERC4626Asset.sol ========================
// ====================================================================

/**
 * @title ERC4626 Asset
 * @dev Representation of an on-chain investment
 */
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {Stabilizer, TransferHelper} from "../Stabilizer/Stabilizer.sol";

contract ERC4626Asset is Stabilizer {
    // Variables
    IERC4626 public immutable asset;

    // Events
    event Invested(uint256 indexed tokenAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _asset,
        address _oracleUsdx,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        asset = IERC4626(_asset);
    }

    /* ========== Views ========== */

    /**
     * @notice Current Value of investment.
     * @return total with 6 decimal to be compatible with dollar coins.
     */
    function currentValue() public view override returns (uint256) {
        uint256 accruedFeeInUSD = sweep.convertToUSD(accruedFee());
        uint256 assetValueInUSD = super._oracleUsdxToUsd(assetValue());
        return assetValueInUSD + super.currentValue() - accruedFeeInUSD;
    }

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     * @dev the price is obtained from the target asset
     */
    function assetValue() public view returns (uint256) {
        uint256 sharesAmount = asset.balanceOf(address(this));
        // All numbers given are in USDX unless otherwise stated
        return asset.convertToAssets(sharesAmount);
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest.
     * @param usdxAmount Amount to be invested
     * @dev Sends usdx to the target asset to get shares.
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
     * @dev Gets usdx back by redeeming shares.
     */
    function divest(
        uint256 usdxAmount,
        uint256
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
        _liquidate(address(asset), getDebt());
    }

    /* ========== Internals ========== */

    function _getToken() internal view override returns (address) {
        return address(asset);
    }

    function _invest(
        uint256 usdxAmount,
        uint256,
        uint256
    ) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(address(usdx), address(asset), usdxAmount);
        asset.deposit(usdxAmount, address(this));

        emit Invested(usdxAmount);
    }

    function _divest(
        uint256 usdxAmount,
        uint256
    ) internal override returns (uint256 divestedAmount) {
        uint usdxBalance = assetValue();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(address(asset), address(asset), usdxAmount);
        asset.withdraw(usdxAmount, address(this), address(this));

        emit Divested(usdxAmount);
        divestedAmount = usdxAmount;
    }
}

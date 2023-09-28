// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== MapleAsset.sol ==========================
// ====================================================================

/**
 * @title Maple Asset
 * @dev Representation of an on-chain investment
 */
import "./Maple/IWithdrawalManager.sol";
import "./Maple/IMaplePool.sol";
import "./ERC4626Asset.sol";

contract MapleAsset is ERC4626Asset {

    IWithdrawalManager public immutable withdrawalManager;

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _asset,
        address _oracleUsdx,
        address _withdrawalManager,
        address borrower
    ) ERC4626Asset(_name, _sweep, _usdx, _asset, _oracleUsdx, borrower) {
        withdrawalManager = IWithdrawalManager(_withdrawalManager);
    }

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     * @dev the price is obtained from the target asset
     */
    function assetValue() public view override returns (uint256) {
        address self = address(this);
        uint256 sharesBalance = asset.balanceOf(self);
        uint256 lockedShares = withdrawalManager.lockedShares(self);
        // All numbers given are in USDX unless otherwise stated
        return asset.convertToAssets(sharesBalance + lockedShares);
    }

    /* ========== Actions ========== */

    /**
     * @notice request Redeem.
     * @param usdxAmount Amount to be requested
     * @dev requests Maple for usdxAmount to be redeemed
     */
    function requestRedeem(uint256 usdxAmount) public onlyBorrower {
        uint256 withdrawAmount = _getSharesAmount(usdxAmount);

        IMaplePool(address(asset)).requestRedeem(withdrawAmount, address(this));
    }

    /**
     * @notice forceRequestWithdraw.
     * @param usdxAmount Amount to be requested
     * @dev requests Maple for usdxAmount to be redeemed
     */
    function forceRequestRedeem(
        uint256 usdxAmount
    ) external onlyMultisigOrGov {
        if (!isDefaulted()) revert NotDefaulted();
        uint256 sharesAmount = _getSharesAmount(usdxAmount);

        IMaplePool(address(asset)).requestRedeem(sharesAmount, address(this));
    }

    /**
     * @notice requestWithdraw.
     * @param usdxAmount Amount to be requested
     * @dev requests Maple for usdxAmount to be divested
     */
    function forceDivest(
        uint256 usdxAmount
    ) external nonReentrant onlyMultisigOrGov {
        if (!isDefaulted()) revert NotDefaulted();
        _divest(usdxAmount, 0);
    }

    function _invest(uint256 usdxAmount, uint256, uint256) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(address(usdx), address(asset), usdxAmount);
        asset.deposit(usdxAmount, address(this));

        emit Invested(usdxAmount);
    }

    function _divest(
        uint256,
        uint256
    ) internal override returns (uint256 divestedAmount) {
        address self = address(this);
        divestedAmount = withdrawalManager.lockedShares(self);
        asset.redeem(divestedAmount, self, self);

        emit Divested(asset.convertToAssets(divestedAmount));
    }

    function _getSharesAmount(uint256 usdxAmount) internal view returns (uint256) {
        uint256 sharesBalance = asset.balanceOf(address(this));
        uint256 sharesAmount = asset.convertToShares(usdxAmount);
        if (sharesBalance > sharesAmount) sharesAmount = sharesBalance;

        return sharesAmount;
    }
}

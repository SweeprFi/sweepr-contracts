// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;
pragma experimental ABIEncoderV2;

// ====================================================================
// ========================= RageAsset.sol =============================
// ====================================================================

/**
 * @title Rage Asset
 * @dev Representation of an on-chain investment on RageTrade
 */

import "./Rage/IDepositPeriphery.sol";
import "./Rage/IWithdrawPeriphery.sol";
import "./Rage/IGmxJuniorVault.sol";
import "../Stabilizer/Stabilizer.sol";

contract RageAsset is Stabilizer {
    // Variables
    IDepositPeriphery private depositPeriphery;
    IWithdrawPeriphery private withdrawPeriphery;
    IGmxJuniorVault private gmxJuniorVault;

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _deposit_periphery,
        address _withdraw_periphery,
        address _gmx_junior_vault,
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
        depositPeriphery = IDepositPeriphery(_deposit_periphery);
        withdrawPeriphery = IWithdrawPeriphery(_withdraw_periphery);
        gmxJuniorVault = IGmxJuniorVault(_gmx_junior_vault);
    }

    /* ========== Views ========== */

    /**
     * @notice Get Current Value
     * @return uint256.
     */
    function currentValue() public view override returns (uint256) {
        return assetValue() + super.currentValue();
    }

    /**
     * @notice Gets the current value in USDX of this OnChainAsset
     * @return the current usdx amount
     */
    function assetValue() public view returns (uint256) {
        uint256 glp_price = getGlpPrice(false); // True: maximum, False: minimum
        uint256 shares = gmxJuniorVault.balanceOf(address(this));
        address asset_address = gmxJuniorVault.asset();
        uint256 assets = gmxJuniorVault.convertToAssets(shares);
        uint256 assets_in_usd = (assets * glp_price) /
            10 ** IERC20Metadata(asset_address).decimals();

        return assets_in_usd;
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest USDX
     * @param _usdx_amount USDX Amount to be invested.
     */
    function invest(
        uint256 _usdx_amount
    ) external onlyBorrower notFrozen validAmount(_usdx_amount) {
        _invest(_usdx_amount, 0);
    }

    /**
     * @notice Divests From Rage.
     * Sends balance from the Rage to the Asset.
     * @param _share_amount Amount to be divested.
     */
    function divest(
        uint256 _share_amount
    ) external onlyBorrower validAmount(_share_amount) {
        _divest(_share_amount);
    }

    /**
     * @notice liquidate
     */
    function liquidate() external {
        _liquidate(address(gmxJuniorVault));
    }

    function _invest(uint256 _usdx_amount, uint256) internal override {
        (uint256 usdx_balance, ) = _balances();
        _usdx_amount = _min(_usdx_amount, usdx_balance);

        TransferHelper.safeApprove(
            address(usdx),
            address(depositPeriphery),
            _usdx_amount
        );

        depositPeriphery.depositToken(
            address(usdx),
            address(this),
            _usdx_amount
        );

        emit Invested(_usdx_amount, 0);
    }

    function _divest(uint256 _share_amount) internal override {
        uint256 share_balance = gmxJuniorVault.balanceOf(address(this));
        _share_amount = _min(_share_amount, share_balance);
        
        TransferHelper.safeApprove(
            address(gmxJuniorVault),
            address(withdrawPeriphery),
            _share_amount
        );

        uint256 usdx_amount = withdrawPeriphery.redeemToken(
            address(usdx),
            address(this),
            _share_amount
        );

        emit Divested(usdx_amount, 0);
    }

    // // Get GLP price in usdx
    function getGlpPrice(bool _maximise) internal view returns (uint256) {
        uint256 price = gmxJuniorVault.getPrice(_maximise); // True: maximum, False: minimum

        return price / 10 ** (gmxJuniorVault.decimals() - usdx.decimals());
    }
}

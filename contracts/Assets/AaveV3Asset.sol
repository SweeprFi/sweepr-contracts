// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= AaveV3Asset.sol ==========================
// ====================================================================

/**
 * @title Aave V3 Asset
 * @dev Representation of an on-chain investment on a Aave pool
 * Intergrated with V3
 */

import "../Stabilizer/Stabilizer.sol";
import "./Aave/IAaveV3Pool.sol";

contract AaveV3Asset is Stabilizer {
    IERC20 private immutable aaveUSDXToken;
    IPool private immutable aaveV3Pool;

    constructor(
        string memory name,
        address sweepAddress,
        address usdxAddress,
        address aaveUsdxAddress,
        address aaveV3PoolAddress,
        address borrower
    )
        Stabilizer(
            name,
            sweepAddress,
            usdxAddress,
            borrower
        )
    {
        aaveUSDXToken = IERC20(aaveUsdxAddress); //aaveUSDC
        aaveV3Pool = IPool(aaveV3PoolAddress);
    }

    /* ========== Views ========== */

    /**
     * @notice Get Current Value
     * @return uint256 Current Value.
     * @dev this value represents the invested amount plus the staked amount in the contract.
     */
    function currentValue() public view override returns (uint256) {
        uint256 accruedFeeInUsd = sweep.convertToUSD(accruedFee());
        return assetValue() + super.currentValue() - accruedFeeInUsd;
    }

    /**
     * @notice Get Asset Value
     * @return uint256 Asset Amount.
     * @dev the invested amount in USDX on the Aave V3 pool.
     */
    function assetValue() public view returns (uint256) {
        // All numbers given are in USDX unless otherwise stated
        return amm().tokenToUSD(aaveUSDXToken.balanceOf(address(this)));
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest USDX
     * @param usdxAmount USDX Amount to be invested.
     * @dev Sends balance to Aave V3.
     */
    function invest(
        uint256 usdxAmount
    ) external onlyBorrower whenNotPaused validAmount(usdxAmount) {
        _invest(usdxAmount, 0, 0);
    }

    /**
     * @notice Divests From Aave.
     * @param usdxAmount Amount to be divested.
     * @dev Sends balance from the Aave V3 pool to the Asset.
     */
    function divest(
        uint256 usdxAmount
    ) external onlyBorrower validAmount(usdxAmount) {
        _divest(usdxAmount, 0);
    }

    /**
     * @notice Liquidate
     * @dev When the asset is defaulted anyone can liquidate it by
     * repaying the debt and getting the same value at a discount.
     */
    function liquidate() external {
        _liquidate(address(aaveUSDXToken));
    }

    /* ========== Internals ========== */

    /**
     * @notice Invest
     * @dev Deposits the amount into the Aave V3 pool.
     */
    function _invest(uint256 usdxAmount, uint256, uint256) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if(usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(
            address(usdx),
            address(aaveV3Pool),
            usdxAmount
        );
        aaveV3Pool.supply(address(usdx), usdxAmount, address(this), 0);

        emit Invested(usdxAmount, 0);
    }

    /**
     * @notice Divest
     * @dev Withdraws the amount from the Aave V3 pool.
     */
    function _divest(uint256 usdxAmount, uint256) internal override {
        if (aaveUSDXToken.balanceOf(address(this)) < usdxAmount)
            usdxAmount = type(uint256).max;

        uint256 divestedAmount = aaveV3Pool.withdraw(address(usdx), usdxAmount, address(this));

        emit Divested(divestedAmount, 0);
    }
}

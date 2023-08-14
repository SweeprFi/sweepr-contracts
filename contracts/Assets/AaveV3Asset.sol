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
    IERC20 private immutable aaveUsdx;
    IPool private immutable aaveV3Pool;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _aaveUsdx,
        address _aaveV3Pool,
        address _oracleUsdx,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        aaveUsdx = IERC20(_aaveUsdx); //aaveUSDC
        aaveV3Pool = IPool(_aaveV3Pool);
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
        uint256 aaveUsdxBalance = aaveUsdx.balanceOf(address(this));
        // All numbers given are in USDX unless otherwise stated
        return _oracleUsdxToUsd(aaveUsdxBalance);
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest USDX
     * @param usdxAmount USDX Amount to be invested.
     * @dev Sends balance to Aave V3.
     */
    function invest(
        uint256 usdxAmount
    ) external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount) {
        _invest(usdxAmount, 0, 0);
    }

    /**
     * @notice Divests From Aave.
     * @param usdxAmount Amount to be divested.
     * @dev Sends balance from the Aave V3 pool to the Asset.
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
     * @dev When the asset is defaulted anyone can liquidate it by
     * repaying the debt and getting the same value at a discount.
     */
    function liquidate() external nonReentrant {
        _liquidate(address(aaveUsdx));
    }

    /* ========== Internals ========== */

    /**
     * @notice Invest
     * @dev Deposits the amount into the Aave V3 pool.
     */
    function _invest(uint256 usdxAmount, uint256, uint256) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(
            address(usdx),
            address(aaveV3Pool),
            usdxAmount
        );
        aaveV3Pool.supply(address(usdx), usdxAmount, address(this), 0);

        emit Invested(usdxAmount);
    }

    /**
     * @notice Divest
     * @dev Withdraws the amount from the Aave V3 pool.
     */
    function _divest(
        uint256 usdxAmount,
        uint256
    ) internal override returns (uint256 divestedAmount) {
        if (aaveUsdx.balanceOf(address(this)) < usdxAmount)
            usdxAmount = type(uint256).max;

        divestedAmount = aaveV3Pool.withdraw(
            address(usdx),
            usdxAmount,
            address(this)
        );

        emit Divested(divestedAmount);
    }
}

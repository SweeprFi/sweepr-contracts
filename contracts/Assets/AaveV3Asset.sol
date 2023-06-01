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
    IERC20 private immutable aaveUSDX_Token;
    IPool private immutable aaveV3_Pool;

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _aave_usdx_address,
        address _aaveV3_pool_address,
        address _borrower
    )
        Stabilizer(
            _name,
            _sweep_address,
            _usdx_address,
            _borrower
        )
    {
        aaveUSDX_Token = IERC20(_aave_usdx_address); //aaveUSDC
        aaveV3_Pool = IPool(_aaveV3_pool_address);
    }

    /* ========== Views ========== */

    /**
     * @notice Get Current Value
     * @return uint256 Current Value.
     * @dev this value represents the invested amount plus the staked amount in the contract.
     */
    function currentValue() public view override returns (uint256) {
        uint256 accrued_fee_in_usd = SWEEP.convertToUSD(accruedFee());
        return assetValue() + super.currentValue() - accrued_fee_in_usd;
    }

    /**
     * @notice Get Asset Value
     * @return uint256 Asset Amount.
     * @dev the invested amount in USDX on the Aave V3 pool.
     */
    function assetValue() public view returns (uint256) {
        // All numbers given are in USDX unless otherwise stated
        return aaveUSDX_Token.balanceOf(address(this));
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest USDX
     * @param _usdx_amount USDX Amount to be invested.
     * @dev Sends balance to Aave V3.
     */
    function invest(
        uint256 _usdx_amount
    ) external onlyBorrower whenNotPaused validAmount(_usdx_amount) {
        _invest(_usdx_amount, 0);
    }

    /**
     * @notice Divests From Aave.
     * @param _usdx_amount Amount to be divested.
     * @dev Sends balance from the Aave V3 pool to the Asset.
     */
    function divest(
        uint256 _usdx_amount
    ) external onlyBorrower validAmount(_usdx_amount) {
        _divest(_usdx_amount);
    }

    /**
     * @notice Liquidate
     * @dev When the asset is defaulted anyone can liquidate it by
     * repaying the debt and getting the same value at a discount.
     */
    function liquidate() external {
        _liquidate(address(aaveUSDX_Token));
    }

    /* ========== Internals ========== */

    /**
     * @notice Invest
     * @dev Deposits the amount into the Aave V3 pool.
     */
    function _invest(uint256 _usdx_amount, uint256) internal override {
        (uint256 usdx_balance, ) = _balances();
        if(usdx_balance < _usdx_amount) _usdx_amount = usdx_balance;

        TransferHelper.safeApprove(
            address(usdx),
            address(aaveV3_Pool),
            _usdx_amount
        );
        aaveV3_Pool.supply(address(usdx), _usdx_amount, address(this), 0);

        emit Invested(_usdx_amount, 0);
    }

    /**
     * @notice Divest
     * @dev Withdraws the amount from the Aave V3 pool.
     */
    function _divest(uint256 _usdx_amount) internal override {
        if (aaveUSDX_Token.balanceOf(address(this)) < _usdx_amount)
            _usdx_amount = type(uint256).max;

        uint256 divestedAmount = aaveV3_Pool.withdraw(address(usdx), _usdx_amount, address(this));

        emit Divested(divestedAmount, 0);
    }
}

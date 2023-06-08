// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= CompV3Asset.sol ==========================
// ====================================================================

import "./Compound/IcUSDC.sol";
import "../Stabilizer/Stabilizer.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Compound V3 Asset
 * @dev Representation of an on-chain investment on a Compound V3
 */

contract CompV3Asset is Stabilizer {
    // Variables
    IcUSDC private immutable cUSDC;

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _cusdc_address,
        address _borrower
    )
        Stabilizer(
            _name,
            _sweep_address,
            _usdx_address,
            _borrower
        )
    {
        cUSDC = IcUSDC(_cusdc_address);
    }

    /* ========== Views ========== */

    /**
     * @notice Current Value
     * @return total with 6 decimal to be compatible with dollar coins.
     */
    function currentValue() public view override returns (uint256) {
        uint256 accrued_fee_in_usd = SWEEP.convertToUSD(accruedFee());
        return assetValue() + super.currentValue() - accrued_fee_in_usd;
    }

    /**
     * @notice Current Value of investment.
     * @return the asset value
     * @dev the value of investment is calculated from cUSDC balance.
     */
    function assetValue() public view returns (uint256) {
        return amm().tokenToUSD(cUSDC.balanceOf(address(this)));
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest stable coins into Compound to get back cUSDC.
     * @param _usdx_amount Amount of usdx to be deposited and minted in cUSDC.
     * @dev the amount deposited will generate rewards in Compound token.
     */
    function invest(
        uint256 _usdx_amount
    ) external onlyBorrower whenNotPaused validAmount(_usdx_amount) {
        _invest(_usdx_amount, 0);
    }

    /**
     * @notice Divests From Compound.
     * @param _usdx_amount Amount to be divested.
     * @dev first redeem from cUSDC and then transfer obtained to message sender.
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
        _liquidate(address(cUSDC));
    }

    /* ========== Internals ========== */

    function _invest(uint256 _usdx_amount, uint256) internal override {
        (uint256 usdx_balance, ) = _balances();
        if(usdx_balance < _usdx_amount) _usdx_amount = usdx_balance;

        TransferHelper.safeApprove(address(usdx), address(cUSDC), _usdx_amount);
        cUSDC.supply(address(usdx), _usdx_amount);

        emit Invested(_usdx_amount, 0);
    }

    function _divest(uint256 _usdx_amount) internal override {          
        uint256 staked_amount = cUSDC.balanceOf(address(this));
        if(staked_amount < _usdx_amount) _usdx_amount = type(uint256).max;

        cUSDC.withdraw(address(usdx), _usdx_amount);

        emit Divested(_usdx_amount, 0);
    }
}

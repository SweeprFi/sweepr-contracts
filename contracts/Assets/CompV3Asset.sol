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
        string memory name,
        address sweepAddress,
        address usdxAddress,
        address cusdcAddress,
        address borrower
    )
        Stabilizer(
            name,
            sweepAddress,
            usdxAddress,
            borrower
        )
    {
        cUSDC = IcUSDC(cusdcAddress);
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
     * @dev the value of investment is calculated from cUSDC balance.
     */
    function assetValue() public view returns (uint256) {
        return amm().tokenToUSD(cUSDC.balanceOf(address(this)));
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest stable coins into Compound to get back cUSDC.
     * @param usdxAmount Amount of usdx to be deposited and minted in cUSDC.
     * @dev the amount deposited will generate rewards in Compound token.
     */
    function invest(
        uint256 usdxAmount
    )
        external
        onlyBorrower
        whenNotPaused
        nonReentrant
        validAmount(usdxAmount)
    {
        _invest(usdxAmount, 0, 0);
    }

    /**
     * @notice Divests From Compound.
     * @param usdxAmount Amount to be divested.
     * @dev first redeem from cUSDC and then transfer obtained to message sender.
     */
    function divest(
        uint256 usdxAmount
    ) external onlyBorrower nonReentrant validAmount(usdxAmount) {
        _divest(usdxAmount, 0);
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external {
        _liquidate(address(cUSDC));
    }

    /* ========== Internals ========== */

    function _invest(uint256 usdxAmount, uint256, uint256) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if(usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(address(usdx), address(cUSDC), usdxAmount);
        cUSDC.supply(address(usdx), usdxAmount);

        emit Invested(usdxAmount, 0);
    }

    function _divest(uint256 usdxAmount, uint256) internal override {
        uint256 stakedAmount = cUSDC.balanceOf(address(this));
        if(stakedAmount < usdxAmount) usdxAmount = type(uint256).max;

        cUSDC.withdraw(address(usdx), usdxAmount);

        emit Divested(usdxAmount, 0);
    }
}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= CompV2Asset.sol ==========================
// ====================================================================

import "./Compound/IcUSDC.sol";
import "./Compound/ICompComptroller.sol";
import "../Oracle/ChainlinkPricer.sol";
import "../Stabilizer/Stabilizer.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Compound V2 Asset
 * @dev Representation of an on-chain investment on a Compound pool
 */

contract CompV2Asset is Stabilizer {
    // Variables
    IcUSDC private immutable cUSDC;
    ERC20 private immutable comp;
    ICompComptroller private immutable compController;

    address private immutable compOracle;
    uint256 private constant COMP_FREQUENCY = 1 hours;

    // Events
    event Collected(address reward, uint256 amount);

    // Errors
    error TransferFailure();

    constructor(
        string memory name,
        address sweepAddress,
        address usdxAddress,
        address compoundAddress,
        address cusdcAddress,
        address controllerAddress,
        address compOracleAddress,
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
        comp = ERC20(compoundAddress);
        compController = ICompComptroller(controllerAddress);
        compOracle = compOracleAddress;
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
     * @dev the value of investment is calculated from cUSDC balance and Compound Rewards.
     */
    function assetValue() public view returns (uint256) {
        uint256 compBalance = comp.balanceOf(address(this));
        (int256 answer, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            compOracle,
            amm().sequencer(),
            COMP_FREQUENCY
        );

        compBalance =
            (compBalance * uint256(answer) * 10 ** usdx.decimals()) /
            (10 ** (comp.decimals() + decimals));

        return compBalance + getAllocation();
    }

    /**
     * @notice Get Allocation of investment.
     * @return total investment in the asset.
     * @dev balance of USDX expressed with 6 decimals.
     */
    function getAllocation() public view returns (uint256) {
        // All numbers given are in USDX unless otherwise stated
        return
            (cUSDC.balanceOf(address(this)) * cUSDC.exchangeRateStored()) /
            1e18;
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest stable coins into Compound to get back cUSDC and COMP rewards.
     * @param usdxAmount Amount of usdx to be deposited and minted in cUSDC.
     * @dev the amount deposited will generate rewards in Compound token.
     */
    function invest(
        uint256 usdxAmount
    ) external onlyBorrower whenNotPaused validAmount(usdxAmount) {
        _invest(usdxAmount, 0);
    }

    /**
     * @notice Divests From Compound.
     * @param usdxAmount Amount to be divested.
     * @dev first redeem from cUSDC and then transfer obtained to message sender.
     */
    function divest(
        uint256 usdxAmount
    ) external onlyBorrower validAmount(usdxAmount) {
        _divest(usdxAmount, 0);
    }

    /**
     * @notice Withdraw Rewards from Compound.
     */
    function collect() public onlyBorrower whenNotPaused {
        address[] memory cTokens = new address[](1);
        cTokens[0] = address(cUSDC);
        compController.claimComp(address(this), cTokens);
        if(!comp.transfer(msg.sender, comp.balanceOf(address(this)))) revert TransferFailure();

        emit Collected(address(comp), comp.balanceOf(address(this)));
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external {
        collect();
        _liquidate(address(cUSDC));
    }

    /* ========== Internals ========== */

    function _invest(uint256 usdxAmount, uint256) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if(usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(address(usdx), address(cUSDC), usdxAmount);
        if(cUSDC.mint(usdxAmount) > 0) revert TransferFailure();

        emit Invested(usdxAmount, 0);
    }

    function _divest(uint256 usdxAmount, uint256) internal override {
        uint256 cusdcAmount = (usdxAmount * (1e18)) /
            cUSDC.exchangeRateStored();
        uint256 stakedAmount = cUSDC.balanceOf(address(this));
        if(stakedAmount < cusdcAmount) cusdcAmount = stakedAmount;

        uint256 divestedAmount = cUSDC.redeem(cusdcAmount);

        emit Divested(divestedAmount, 0);
    }
}

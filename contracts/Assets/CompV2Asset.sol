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

    address private immutable comp_oracle;
    uint256 private constant COMP_FREQUENCY = 1 hours;

    // Events
    event Collected(address reward, uint256 amount);

    // Errors
    error TransferFailure();

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _compound_address,
        address _cusdc_address,
        address _controller_address,
        address _oracle_comp_address,
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
        comp = ERC20(_compound_address);
        compController = ICompComptroller(_controller_address);
        comp_oracle = _oracle_comp_address;
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
     * @dev the value of investment is calculated from cUSDC balance and Compound Rewards.
     */
    function assetValue() public view returns (uint256) {
        uint256 comp_balance = comp.balanceOf(address(this));
        (int256 answer, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            comp_oracle,
            amm.sequencer(),
            COMP_FREQUENCY
        );

        comp_balance =
            (comp_balance * uint256(answer) * 10 ** usdx.decimals()) /
            (10 ** (comp.decimals() + decimals));
        uint256 usdx_amount = getAllocation();

        return usdx_amount + comp_balance;
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

    function _invest(uint256 _usdx_amount, uint256) internal override {
        (uint256 usdx_balance, ) = _balances();
        if(usdx_balance < _usdx_amount) _usdx_amount = usdx_balance;

        TransferHelper.safeApprove(address(usdx), address(cUSDC), _usdx_amount);
        if(cUSDC.mint(_usdx_amount) > 0) revert TransferFailure();

        emit Invested(_usdx_amount, 0);
    }

    function _divest(uint256 _usdx_amount) internal override {
        uint256 cusdc_amount = (_usdx_amount * (1e18)) /
            cUSDC.exchangeRateStored();
        uint256 staked_amount = cUSDC.balanceOf(address(this));
        if(staked_amount < cusdc_amount) cusdc_amount = staked_amount;

        uint256 divestedAmount = cUSDC.redeem(cusdc_amount);

        emit Divested(divestedAmount, 0);
    }
}

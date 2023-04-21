// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

// ====================================================================
// ========================= CompV2Asset.sol ==========================
// ====================================================================

import "./Compound/IcUSDC.sol";
import "./Compound/ICompComptroller.sol";
import "../Oracle/AggregatorV3Interface.sol";
import "../Common/ERC20/Variants/Comp.sol";
import "../Stabilizer/Stabilizer.sol";

/**
 * @title Compound V2 Asset
 * @dev Representation of an on-chain investment on a Compound pool
 */

contract CompV2Asset is Stabilizer {
    // Variables
    IcUSDC public cUSDC;
    Comp public comp;
    ICompComptroller private immutable compController;

    // Oracle to fetch price COMP / USDC
    AggregatorV3Interface private immutable compOracle;

    // Events
    event Collected(address reward, uint256 amount);

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _compound_address,
        address _cusdc_address,
        address _controller_address,
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
        cUSDC = IcUSDC(_cusdc_address);
        comp = Comp(_compound_address);
        compController = ICompComptroller(_controller_address);
        compOracle = AggregatorV3Interface(0xdbd020CAeF83eFd542f4De03e3cF0C28A4428bd5);
    }

    /* ========== Views ========== */

    /**
     * @notice Current Value
     * @return total with 6 decimal to be compatible with dollar coins.
     */
    function currentValue() public view override returns (uint256) {
        return assetValue() + super.currentValue();
    }

    /**
     * @notice Current Value of investment.
     * @return the asset value
     * @dev the value of investment is calculated from cUSDC balance and Compound Rewards.
     */
    function assetValue() public view returns (uint256) {
        uint256 comp_balance = comp.balanceOf(address(this));
        (, int256 answer, , uint256 updatedAt, ) = compOracle.latestRoundData();

        if(answer == 0) revert ZeroPrice();
        if(updatedAt < block.timestamp - 1 hours) revert StalePrice();

        comp_balance =
            (comp_balance * uint256(answer) * 10 ** usdx.decimals()) /
            (10 ** (comp.decimals() + compOracle.decimals()));
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
    ) external onlyBorrower notFrozen validAmount(_usdx_amount) {
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
    function collect() public onlyBorrower notFrozen {
        address[] memory cTokens = new address[](1);
        cTokens[0] = address(cUSDC);
        compController.claimComp(address(this), cTokens);
        comp.transfer(msg.sender, comp.balanceOf(address(this)));

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
        _usdx_amount = _min(_usdx_amount, usdx_balance);

        TransferHelper.safeApprove(address(usdx), address(cUSDC), _usdx_amount);
        cUSDC.mint(_usdx_amount);

        emit Invested(_usdx_amount, 0);
    }

    function _divest(uint256 _usdx_amount) internal override {
        uint256 cusdc_amount = (_usdx_amount * (1e18)) /
            cUSDC.exchangeRateStored();
        uint256 staked_amount = cUSDC.balanceOf(address(this));
        cusdc_amount = _min(cusdc_amount, staked_amount);
        cUSDC.redeem(cusdc_amount);

        emit Divested(_usdx_amount, 0);
    }
}

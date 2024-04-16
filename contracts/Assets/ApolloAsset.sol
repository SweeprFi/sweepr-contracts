// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== ApolloAsset.sol ===========================
// ====================================================================

/**
 * @title Apollo Asset
 * @dev Representation of an on-chain investment on ApolloX finance.
 */

import { Stabilizer } from "../Stabilizer/Stabilizer.sol";
import { IApolloX } from "./Interfaces/ApolloX/IApolloX.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";

contract ApolloAsset is Stabilizer {
    error UnexpectedAmount();
    error CooldownError();

    // Variables
    IApolloX private constant apollo = IApolloX(0x1b6F2d3844C6ae7D56ceb3C3643b9060ba28FEb0);
    IERC20Metadata private constant alp = IERC20Metadata(0x4E47057f45adF24ba41375a175dA0357cB3480E5);
    uint256 public investedAt;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _oracleUsdx,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        alp.approve(address(apollo), type(uint256).max);
        usdx.approve(address(apollo), type(uint256).max);
    }

    /* ========== Views ========== */

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     */
    function assetValue() public view override returns (uint256) {
        return _oracleUsdxToUsd(getDepositAmount());
    }

    function getDepositAmount() public view returns (uint256) {
        return apollo.stakeOf(address(this)) * apollo.alpPrice() / 1e8;
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest.
     * @param usdxAmount Amount of usdx to be swapped for token.
     * @param alpAmountOut Minimum amount out of ALP.
     */
    function invest(uint256 usdxAmount, uint256 alpAmountOut) 
        external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount)
    {
        _invest(usdxAmount, 0, alpAmountOut);
    }

    /**
     * @notice Divest.
     * @param alpAmount Amount to be divested.
     * @param usdxMinOut Minimum amount out of usdx.
     */
    function divest(uint256 alpAmount, uint256 usdxMinOut)
        external onlyBorrower nonReentrant validAmount(alpAmount)
    {
        _divest(alpAmount, usdxMinOut);
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external nonReentrant {
        if(auctionAllowed) revert ActionNotAllowed();
        apollo.unStake(apollo.stakeOf(address(this)));
        _liquidate(_getToken(), getDebt());
    }

    function collect() external nonReentrant onlyBorrower {
        apollo.claimAllReward();
    }

    /* ========== Internals ========== */

    function _getToken() internal pure override returns (address) {
        return address(alp);
    }

    function _invest(uint256 usdxAmount, uint256, uint256 minAlpOut)
        internal override 
    {
        investedAt = block.timestamp;

        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        apollo.mintAlp(address(usdx), usdxAmount, minAlpOut, true);

        emit Invested(usdxAmount);
    }

    function _divest(uint256 alpAmount, uint256 usdxMinOut) internal override  {
        if(block.timestamp - investedAt < apollo.coolingDuration()) revert CooldownError();

        uint256 alpBalance = apollo.stakeOf(address(this));
        if(alpAmount > alpBalance) alpAmount = alpBalance;

        apollo.unStake(alpAmount);
        apollo.burnAlp(address(usdx), alpAmount, usdxMinOut, address(this));

        emit Divested(usdxMinOut);
    }

}

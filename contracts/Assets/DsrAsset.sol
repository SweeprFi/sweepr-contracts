// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= DsrAsset.sol ==========================
// ====================================================================

/**
 * @title DSR Asset
 * @dev Representation of an on-chain investment on a DAI
 */

import { IERC20Metadata } from "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { IPSM } from "./Interfaces/DAI/IPSM.sol";
import { Stabilizer, IPriceFeed, OvnMath, TransferHelper, ChainlinkLibrary } from "../Stabilizer/Stabilizer.sol";

contract DsrAsset is Stabilizer {
    IPriceFeed private immutable oracleDai;

    IERC20Metadata private immutable dai;
    IERC4626 private immutable sDai;
    IPSM private immutable psm;

    uint256 private constant WAD = 1e18;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    // Errors
    error UnexpectedAmount();

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _dai,
        address _sDai,
        address _psm,
        address _oracleUsdx,
        address _oracleDai,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        dai = IERC20Metadata(_dai);
        sDai = IERC4626(_sDai);
        psm = IPSM(_psm);
        oracleDai = IPriceFeed(_oracleDai);
    }

    /* ========== Views ========== */

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     * @dev the price is obtained from the target asset
     */
    function assetValue() public view virtual override returns (uint256) {
        uint256 sharesBalance = sDai.balanceOf(address(this));
        uint256 assetsBalance = sDai.convertToAssets(sharesBalance);

        return _oracleDaiToUsd(assetsBalance);
    }

    /* ========== Actions ========== */

    /**
     * @notice Liquidate
     * @dev When the asset is defaulted anyone can liquidate it by
     * repaying the debt and getting the same value at a discount.
     */
    function liquidate() external virtual nonReentrant {
        if(auctionAllowed) revert ActionNotAllowed();
        _liquidate(_getToken(), getDebt());
    }

    /**
     * @notice Invest USDX
     * @param usdxAmount USDX Amount to be invested.
     * @param slippage .
     * @dev Sends balance to DSR.
     */
    function invest(uint256 usdxAmount, uint256 slippage) 
        external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount)
    {
        _invest(usdxAmount, 0, slippage);
    }

    /**
     * @notice Divests From DSR.
     * @param usdxAmount Amount to be divested.
     * @param slippage .
     * @dev Sends balance from the DSR to the Asset.
     */
    function divest(uint256 usdxAmount, uint256 slippage)
        external onlyBorrower nonReentrant validAmount(usdxAmount)
    {
        _divest(usdxAmount, slippage);
    }

    /* ========== Internals ========== */

    function _getToken() internal view override returns (address) {
        return address(sDai);
    }

    /**
     * @notice Invest
     * @dev Deposits the amount into the DSR.
     */
    function _invest(uint256 usdxAmount, uint256, uint256 slippage) 
        internal override 
    {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        uint256 daiBalance = dai.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        // Exchange Usdx to Dai by using PSM
        TransferHelper.safeApprove(address(usdx), psm.gemJoin(), usdxAmount);
        psm.sellGem(address(this), usdxAmount);

        // Check return amount validation
        uint256 estimatedAmount = _usdxToDai(OvnMath.subBasisPoints(usdxAmount, slippage));
        uint256 investDaiAmount = dai.balanceOf(address(this)) - daiBalance;
        if (investDaiAmount == 0 || investDaiAmount < estimatedAmount) {
            revert UnexpectedAmount();
        }    

        // Invest Dai to the dsr
        TransferHelper.safeApprove(address(dai), address(sDai), investDaiAmount);
        sDai.deposit(investDaiAmount, address(this));

        emit Invested(_daiToUsdx(investDaiAmount));
    }

    /**
     * @notice Divest
     * @dev Withdraws the amount from the DSR.
     */
    function _divest(
        uint256 usdxAmount,
        uint256 slippage
    ) internal override {        
        uint256 initialDaiBalance = dai.balanceOf(address(this));
        uint256 initialUsdxBalance = usdx.balanceOf(address(this));
        
        uint256 sharesBalance = sDai.balanceOf(address(this));
        if (sharesBalance == 0) revert NotEnoughBalance();
        uint256 sharesAmount = sDai.convertToShares(usdxAmount);
        if (sharesBalance > sharesAmount) sharesAmount = sharesBalance;

        uint256 withdrawAmount = sDai.convertToAssets(sharesAmount);
        sDai.withdraw(withdrawAmount, address(this), address(this));

        // Check return amount from dsrManager
        uint256 daiBalance = dai.balanceOf(address(this)) - initialDaiBalance;
        if (daiBalance == 0 || daiBalance < withdrawAmount) revert UnexpectedAmount();

        // Exchange Dai to Usdx by using PSM
        TransferHelper.safeApprove(address(dai), address(psm), daiBalance);
        withdrawAmount = _daiToUsdx(OvnMath.subBasisPoints(daiBalance, slippage));

        // Reduce fee from the request Usdx amount
        uint256 psmFee = psm.tout();
        daiBalance = (daiBalance * WAD) / (WAD + psmFee);
        uint256 daiInUsdx = _daiToUsdx(daiBalance);
        psm.buyGem(address(this), daiInUsdx);

        // Calculate real divested Usdx amount
        uint256 usdxBalance = usdx.balanceOf(address(this)) - initialUsdxBalance;
        // Sanity check
        if (usdxBalance < withdrawAmount) revert UnexpectedAmount();

        emit Divested(usdxBalance);
    }

    /**
     * @notice Convert Dai to Usd by using Oracle
     */
    function _oracleDaiToUsd(
        uint256 daiAmount
    ) internal view returns (uint256) {
        return
            ChainlinkLibrary.convertTokenToUsd(
                daiAmount,
                dai.decimals(),
                oracleDai
            );
    }

    /**
     * @notice Convert Usdx to Dai by using Oracle
     */
    function _oracleUsdxToDai(
        uint256 usdxAmount
    ) internal view returns (uint256) {
        return
            ChainlinkLibrary.convertTokenToToken(
                usdxAmount,
                usdx.decimals(),
                dai.decimals(),
                oracleUsdx,
                oracleDai
            );
    }

    /**
     * @notice Convert Dai to Usdx (1:1 rate)
     */
    function _daiToUsdx(uint256 daiAmount) internal view returns (uint256) {
        return (daiAmount * (10 ** usdx.decimals())) / (10 ** dai.decimals());
    }

    /**
     * @notice Convert Usdx to Dai (1:1 rate)
     */
    function _usdxToDai(uint256 usdxAmount) internal view returns (uint256) {
        return (usdxAmount * (10 ** dai.decimals())) / (10 ** usdx.decimals());
    }
}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= DsrAsset.sol ==========================
// ====================================================================

/**
 * @title DSR Asset
 * @dev Representation of an on-chain investment on a DAI
 */

import "./DAI/IDsrManager.sol";
import "./DAI/IPot.sol";
import "../Libraries/RMath.sol";
import "../Libraries/OvnMath.sol";
import "../Libraries/Chainlink.sol";
import "../Stabilizer/Stabilizer.sol";

contract DsrAsset is Stabilizer {
    IERC20Metadata private immutable dai;
    IDsrManager private immutable dsrManager;
    IPot private immutable pot;

    IPriceFeed public oracleUsdx;
    IPriceFeed public oracleDai;

    uint256 private immutable usdxDm;
    uint256 private immutable daiDm;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _dai,
        address _dsrManager,
        address _oracleUsdx,
        address _oracleDai,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _borrower) {
        dai = IERC20Metadata(_dai);
        dsrManager = IDsrManager(_dsrManager);
        pot = IPot(dsrManager.pot());
        oracleUsdx = IPriceFeed(_oracleUsdx);
        oracleDai = IPriceFeed(_oracleDai);
        usdxDm = 10 ** IERC20Metadata(_usdx).decimals();
        daiDm = 10 ** IERC20Metadata(_dai).decimals();
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
     * @dev the invested amount in USDX on the DSR.
     */
    function assetValue() public view returns (uint256) {
        uint256 daiAmount = dsrManager.pieOf(address(this));
        uint256 chi = pot.chi();
        daiAmount = RMath.rmul(chi, daiAmount); // included reward

        return _oracleDaiToUsd(daiAmount);
    }

    /* ========== Actions ========== */

    /**
     * @notice dsrDaiBalance
     * @dev Get the invested dai amount
     */
    function dsrDaiBalance() external nonReentrant returns (uint256) {
        return dsrManager.daiBalance(address(this));
    }

    /**
     * @notice Invest USDX
     * @param usdxAmount USDX Amount to be invested.
     * @param slippage .
     * @dev Sends balance to DSR.
     */
    function invest(
        uint256 usdxAmount,
        uint256 slippage
    ) external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount) {
        _invest(usdxAmount, 0, slippage);
    }

    /**
     * @notice Divests From DSR.
     * @param usdxAmount Amount to be divested.
     * @param slippage .
     * @dev Sends balance from the DSR to the Asset.
     */
    function divest(
        uint256 usdxAmount,
        uint256 slippage
    ) external onlyBorrower nonReentrant validAmount(usdxAmount) {
        _divest(usdxAmount, slippage);
    }

    /**
     * @notice Liquidate
     * @dev When the asset is defaulted anyone can liquidate it by
     * repaying the debt and getting the same value at a discount.
     */
    function liquidate() external nonReentrant {
        _liquidate(address(dai));
    }

    /* ========== Internals ========== */

    /**
     * @notice Invest
     * @dev Deposits the amount into the DSR.
     */
    function _invest(
        uint256 usdxAmount,
        uint256,
        uint256 slippage
    ) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(address(usdx), sweep.amm(), usdxAmount);
        uint256 usdxInDai = _oracleUsdxToDai(usdxAmount);
        uint256 daiAmount = amm().swapExactInput(
            address(usdx),
            address(dai),
            usdxAmount,
            OvnMath.subBasisPoints(usdxInDai, slippage)
        );

        TransferHelper.safeApprove(
            address(dai),
            address(dsrManager),
            daiAmount
        );
        dsrManager.join(address(this), daiAmount);

        emit Invested(daiAmount);
    }

    /**
     * @notice Divest
     * @dev Withdraws the amount from the DSR.
     */
    function _divest(uint256 usdxAmount, uint256 slippage) internal override {
        uint256 daiAmount = _oracleUsdxToDai(usdxAmount);
        uint256 investedAmount = assetValue();

        if (daiAmount < investedAmount) {
            dsrManager.exit(address(this), daiAmount);
        } else {
            dsrManager.exitAll(address(this));
        }

        uint256 daiBalance = dai.balanceOf(address(this));
        if (daiBalance == 0) revert NotEnoughBalance();

        uint256 daiInUsdx = _oracleDaiToUsdx(daiBalance);
        TransferHelper.safeApprove(address(dai), sweep.amm(), daiBalance);
        uint256 divestedAmount = amm().swapExactInput(
            address(dai),
            address(usdx),
            daiBalance,
            OvnMath.subBasisPoints(daiInUsdx, slippage)
        );

        emit Divested(divestedAmount);
    }

    function _oracleDaiToUsd(
        uint256 daiAmount
    ) internal view returns (uint256) {
        uint256 priceDai = ChainlinkLibrary.getPrice(oracleDai);

        return ChainlinkLibrary.convertTokenToUsd(daiAmount, daiDm, priceDai);
    }

    function _oracleDaiToUsdx(
        uint256 daiAmount
    ) internal view returns (uint256) {
        uint256 priceDai = ChainlinkLibrary.getPrice(oracleDai);
        uint256 priceUsdx = ChainlinkLibrary.getPrice(oracleUsdx);

        return
            ChainlinkLibrary.convertTokenToToken(
                daiAmount,
                daiDm,
                usdxDm,
                priceDai,
                priceUsdx
            );
    }

    function _oracleUsdxToDai(
        uint256 usdxAmount
    ) internal view returns (uint256) {
        uint256 priceDai = ChainlinkLibrary.getPrice(oracleDai);
        uint256 priceUsdx = ChainlinkLibrary.getPrice(oracleUsdx);

        return
            ChainlinkLibrary.convertTokenToToken(
                usdxAmount,
                usdxDm,
                daiDm,
                priceUsdx,
                priceDai
            );
    }
}

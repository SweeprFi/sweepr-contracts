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
import "./DAI/IPsm.sol";
import "../Libraries/RMath.sol";
import "../Stabilizer/Stabilizer.sol";

contract DsrAsset is Stabilizer {
    IERC20Metadata private immutable dai;
    IDsrManager private immutable dsrManager;
    IPot private immutable pot;
    IPsm private immutable psm;
    IPriceFeed private immutable oracleDai;

    address private immutable gemJoin;
    uint256 private constant WAD = 10 ** 18;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _dai,
        address _dsrManager,
        address _dssPsm,
        address _oracleUsdx,
        address _oracleDai,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        dai = IERC20Metadata(_dai);
        dsrManager = IDsrManager(_dsrManager);
        pot = IPot(dsrManager.pot());
        psm = IPsm(_dssPsm);
        gemJoin = psm.gemJoin();
        oracleDai = IPriceFeed(_oracleDai);
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
     * @dev Sends balance to DSR.
     */
    function invest(
        uint256 usdxAmount
    ) external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount) {
        _invest(usdxAmount, 0, 0);
    }

    /**
     * @notice Divests From DSR.
     * @param usdxAmount Amount to be divested.
     * @dev Sends balance from the DSR to the Asset.
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
        _liquidate(address(dai));
    }

    /* ========== Internals ========== */

    /**
     * @notice Invest
     * @dev Deposits the amount into the DSR.
     */
    function _invest(uint256 usdxAmount, uint256, uint256) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        // Exchange Usdx to Dai by using PSM
        TransferHelper.safeApprove(address(usdx), address(gemJoin), usdxAmount);
        psm.sellGem(address(this), usdxAmount);

        // Invest Dai to the dsr
        uint256 daiBalance = dai.balanceOf(address(this));
        if (daiBalance == 0) revert NotEnoughBalance();
        TransferHelper.safeApprove(
            address(dai),
            address(dsrManager),
            daiBalance
        );
        dsrManager.join(address(this), daiBalance);

        emit Invested(usdxAmount);
    }

    /**
     * @notice Divest
     * @dev Withdraws the amount from the DSR.
     */
    function _divest(
        uint256 usdxAmount,
        uint256
    ) internal override returns (uint256 divestedAmount) {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        uint256 daiAmount = _oracleUsdxToDai(usdxAmount);
        uint256 investedAmount = assetValue();

        // Withdraw Dai from DSR
        if (daiAmount < investedAmount) {
            dsrManager.exit(address(this), daiAmount);
        } else {
            dsrManager.exitAll(address(this));
        }

        // Exchange Dai to Usdx by using PSM
        uint256 daiBalance = dai.balanceOf(address(this));
        if (daiBalance == 0) revert NotEnoughBalance();
        TransferHelper.safeApprove(address(dai), address(psm), daiBalance);

        // Reduce fee from the request Usdx amount
        uint256 psmFee = psm.tout();
        daiBalance = (daiBalance * WAD) / (WAD + psmFee);
        uint256 daiInUsdx = _daiToUsdx(daiBalance);
        psm.buyGem(address(this), daiInUsdx);

        // Calculate real divested Usdx amount
        divestedAmount = usdx.balanceOf(address(this)) - usdxBalance;

        emit Divested(divestedAmount);
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
}

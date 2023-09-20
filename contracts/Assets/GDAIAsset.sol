// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== GDAIAsset.sol ==========================
// ====================================================================

/**
 * @title GDAI Asset
 * @dev Representation of an on-chain investment on gTrade.
 */

import "./GDAI/IGToken.sol";
import "./DAI/IPsm.sol";
import "./GDAI/IOpenTradesPnlFeed.sol";
import "../Stabilizer/Stabilizer.sol";

contract GDAIAsset is Stabilizer {
    IGToken private immutable gDai;
    IERC20Metadata private immutable dai;
    IOpenTradesPnlFeed private immutable openTradesPnlFeed;
    IPriceFeed private immutable oracleDai;
    IPsm private immutable psm;

    // Variables
    address private immutable gemJoin;
    uint256 public unlockEpoch;
    uint256 public divestStartTime;

    // Constants
    uint256 private constant GDAI_FREQUENCY = 1 days; // gDai frequency
    uint256 private constant DIVEST_DURATION = 2 days;
    uint256 private constant EPOCH_DURATION = 3 days;
    uint256 private constant WAD = 10 ** 18;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);
    event Request(uint256 gDaiAmount, uint256 epoch, uint256 startTime);

    // Errors
    error RequestNotAvailable();
    error DivestNotAvailable();
    error UnExpectedAmount();

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _gDai,
        address _dssPsm,
        address _oracleUsdx,
        address _oracleDai,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        gDai = IGToken(_gDai);
        dai = IERC20Metadata(gDai.asset());
        psm = IPsm(_dssPsm);
        gemJoin = psm.gemJoin();
        openTradesPnlFeed = IOpenTradesPnlFeed(gDai.openTradesPnlFeed());
        oracleDai = IPriceFeed(_oracleDai);
    }

    /* ========== Views ========== */

    /**
     * @notice Current Value of investment.
     * @return total with 6 decimal to be compatible with dollar coins.
     */
    function currentValue() public view override returns (uint256) {
        uint256 accruedFeeInUSD = sweep.convertToUSD(accruedFee());
        return assetValue() + super.currentValue() - accruedFeeInUSD;
    }

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     * @dev the price is obtained from Chainlink
     */
    function assetValue() public view returns (uint256) {
        uint256 gDaiBalance = gDai.balanceOf(address(this));
        uint256 daiBalance = gDai.previewRedeem(gDaiBalance);

        return _oracleDaiToUsd(daiBalance);
    }

    /**
     * @notice Request Status.
     * @return available True: available, False: unAvailable
     * @return startTime Start Time to send the request.
     * @return endTime End Time to send the request.
     * @dev borrower check when request is available.
     */
    function requestStatus()
        public
        view
        returns (bool available, uint256 startTime, uint256 endTime)
    {
        uint256 currentEpochStartTime = gDai.currentEpochStart();
        available = (openTradesPnlFeed.nextEpochValuesRequestCount() == 0);
        startTime = block.timestamp > currentEpochStartTime + DIVEST_DURATION
            ? currentEpochStartTime + EPOCH_DURATION
            : currentEpochStartTime;
        endTime = startTime + DIVEST_DURATION;
    }

    /**
     * @notice Divest Status.
     * @return available True: available, False: unAvailable
     * @return startTime Start Time to divest.
     * @return endTime End Time to divest.
     * @dev borrower check when divest is available.
     */
    function divestStatus()
        public
        view
        returns (bool available, uint256 startTime, uint256 endTime)
    {
        uint256 requestAmount = gDai.withdrawRequests(
            address(this),
            unlockEpoch
        );
        uint256 currentEpoch = gDai.currentEpoch();
        startTime = requestAmount > 0 && currentEpoch <= unlockEpoch
            ? divestStartTime
            : 0;
        endTime = startTime > 0 ? startTime + DIVEST_DURATION : 0;
        available =
            currentEpoch == unlockEpoch &&
            requestAmount > 0 &&
            startTime <= block.timestamp &&
            block.timestamp <= endTime;
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest.
     * @param usdxAmount Amount of usdx to be invested for gDai.
     * @param slippage .
     * @dev get gDai from the usdx.
     */
    function invest(
        uint256 usdxAmount,
        uint256 slippage
    ) external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount) {
        _invest(usdxAmount, 0, slippage);
    }

    /**
     * @notice Divest.
     * @param usdxAmount Amount to be divested.
     * @param slippage .
     * @dev get usdx from the gDai.
     */
    function divest(
        uint256 usdxAmount,
        uint256 slippage
    )
        external
        onlyBorrower
        nonReentrant
        validAmount(usdxAmount)
        returns (uint256)
    {
        return _divest(usdxAmount, slippage);
    }

    /**
     * @notice Reqest.
     * @param usdxAmount Amount to be divested.
     * @dev Send request to withdraw from gDai.
     */
    function request(uint256 usdxAmount) external onlyBorrower {
        (bool available, , ) = requestStatus();
        if (!available) revert RequestNotAvailable();
        if (gDai.balanceOf(address(this)) == 0) revert NotEnoughBalance();

        uint256 daiAmount = _oracleUsdxToDai(usdxAmount);
        uint256 gDaiAmount = gDai.convertToShares(daiAmount);
        uint256 gDaiBalance = gDai.balanceOf(address(this));
        uint256 shares = gDai.totalSharesBeingWithdrawn(address(this));

        if (gDaiBalance < gDaiAmount) gDaiAmount = gDaiBalance;
        if (shares + gDaiAmount > gDaiBalance) gDaiAmount -= shares;

        gDai.makeWithdrawRequest(gDaiAmount, address(this));

        uint256 epochsTimelock = gDai.withdrawEpochsTimelock();
        unlockEpoch = gDai.currentEpoch() + epochsTimelock;
        divestStartTime =
            gDai.currentEpochStart() +
            epochsTimelock *
            EPOCH_DURATION;

        emit Request(gDaiAmount, unlockEpoch, divestStartTime);
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external nonReentrant {
        if(auctionAllowed) revert NotAllowedAction();
        _liquidate(address(gDai), getDebt());
    }

    /* ========== Internals ========== */

    function _getToken() internal view override returns (address) {
        return address(gDai);
    }

    /**
     * @notice Invest
     * @dev Deposits the amount into the GDai.
     */
    function _invest(
        uint256 usdxAmount,
        uint256,
        uint256 slippage
    ) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        uint256 daiBalance = dai.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        // Exchange Usdx to Dai by using PSM
        uint256 estimatedAmount = _usdxToDai(
            OvnMath.subBasisPoints(usdxAmount, slippage)
        );
        TransferHelper.safeApprove(address(usdx), address(gemJoin), usdxAmount);
        psm.sellGem(address(this), usdxAmount);
        uint256 investDaiAmount = dai.balanceOf(address(this)) - daiBalance;
        // Check return amount validation
        if (investDaiAmount == 0 || investDaiAmount < estimatedAmount)
            revert UnExpectedAmount();

        // Invest Dai to the GDai
        TransferHelper.safeApprove(
            address(dai),
            address(gDai),
            investDaiAmount
        );
        gDai.deposit(investDaiAmount, address(this));

        emit Invested(_daiToUsdx(investDaiAmount));
    }

    /**
     * @notice Divest
     * @dev Withdraws the amount from the GDai.
     */
    function _divest(
        uint256 usdxAmount,
        uint256 slippage
    ) internal override returns (uint256 divestedAmount) {
        (bool available, , ) = divestStatus();
        if (!available) revert DivestNotAvailable();

        uint256 usdxBalance = usdx.balanceOf(address(this));
        uint256 daiAmount = _oracleUsdxToDai(usdxAmount);
        uint256 gDaiAmount = gDai.convertToShares(daiAmount);
        uint256 gDaiBalance = gDai.balanceOf(address(this));
        if (gDaiBalance == 0) revert NotEnoughBalance();

        // Withdraw Dai from GDai
        if (gDaiBalance < gDaiAmount) gDaiAmount = gDaiBalance;
        daiAmount = gDai.redeem(gDaiAmount, address(this), address(this));

        // Check return amount
        if (daiAmount < gDai.convertToAssets(gDaiAmount))
            revert UnExpectedAmount();

        // Exchange Dai to Usdx by using PSM
        uint256 estimatedAmount = _daiToUsdx(
            OvnMath.subBasisPoints(daiAmount, slippage)
        );
        TransferHelper.safeApprove(address(dai), address(psm), daiAmount);
        // Reduce fee from the request Usdx amount
        uint256 psmFee = psm.tout();
        daiAmount = (daiAmount * WAD) / (WAD + psmFee);
        uint256 daiInUsdx = _daiToUsdx(daiAmount);
        psm.buyGem(address(this), daiInUsdx);

        // Sanity check && Calculate real divested Usdx amount
        if (
            estimatedAmount >
            (divestedAmount = usdx.balanceOf(address(this)) - usdxBalance)
        ) revert UnExpectedAmount();

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

    /**
     * @notice Convert Usdx to Dai (1:1 rate)
     */
    function _usdxToDai(uint256 usdxAmount) internal view returns (uint256) {
        return (usdxAmount * (10 ** dai.decimals())) / (10 ** usdx.decimals());
    }
}

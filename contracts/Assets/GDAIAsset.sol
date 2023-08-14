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
import "./GDAI/IOpenTradesPnlFeed.sol";
import "../Stabilizer/Stabilizer.sol";

contract GDAIAsset is Stabilizer {
    IGToken private immutable gDai;
    IERC20Metadata private immutable dai;
    IOpenTradesPnlFeed private immutable openTradesPnlFeed;
    IPriceFeed private immutable oracleDai;

    // Variables
    uint256 public unlockEpoch;
    uint256 public divestStartTime;

    // Constants
    uint256 private constant GDAI_FREQUENCY = 1 days; // gDai frequency
    uint256 private constant DIVEST_DURATION = 2 days;
    uint256 private constant EPOCH_DURATION = 3 days;

    // Events
    event Invested(uint256 indexed gDaiAmount);
    event Divested(uint256 indexed usdxAmount);
    event Request(uint256 gDaiAmount, uint256 epoch, uint256 startTime);

    // Errors
    error RequestNotAvailable();
    error DivestNotAvailable();

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _gDai,
        address _oracleUsdx,
        address _oracleDai,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        gDai = IGToken(_gDai);
        dai = IERC20Metadata(gDai.asset());
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
        _liquidate(address(gDai));
    }

    /* ========== Internals ========== */

    function _invest(
        uint256 usdxAmount,
        uint256,
        uint256 slippage
    ) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        IAMM _amm = amm();
        uint256 usdxInDai = _oracleUsdxToDai(usdxAmount);
        TransferHelper.safeApprove(address(usdx), address(_amm), usdxAmount);
        uint256 daiAmount = _amm.swapExactInput(
            address(usdx),
            address(dai),
            usdxAmount,
            OvnMath.subBasisPoints(usdxInDai, slippage)
        );
        TransferHelper.safeApprove(address(dai), address(gDai), daiAmount);
        uint256 gDaiAmount = gDai.deposit(daiAmount, address(this));

        emit Invested(gDaiAmount);
    }

    function _divest(
        uint256 usdxAmount,
        uint256 slippage
    ) internal override returns (uint256 divestedAmount) {
        (bool available, , ) = divestStatus();
        if (!available) revert DivestNotAvailable();

        uint256 daiAmount = _oracleUsdxToDai(usdxAmount);
        uint256 gDaiAmount = gDai.convertToShares(daiAmount);
        uint256 gDaiBalance = gDai.balanceOf(address(this));

        IAMM _amm = amm();
        if (gDaiBalance < gDaiAmount) gDaiAmount = gDaiBalance;
        daiAmount = gDai.redeem(gDaiAmount, address(this), address(this));
        uint256 daiInUsdx = _oracleDaiToUsdx(daiAmount);
        TransferHelper.safeApprove(address(dai), address(_amm), daiAmount);
        divestedAmount = _amm.swapExactInput(
            address(dai),
            address(usdx),
            daiAmount,
            OvnMath.subBasisPoints(daiInUsdx, slippage)
        );

        emit Divested(divestedAmount);
    }

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

    function _oracleDaiToUsdx(
        uint256 daiAmount
    ) internal view returns (uint256) {
        return
            ChainlinkLibrary.convertTokenToToken(
                daiAmount,
                dai.decimals(),
                usdx.decimals(),
                oracleDai,
                oracleUsdx
            );
    }

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
}

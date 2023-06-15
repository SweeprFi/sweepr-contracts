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
import "../Oracle/ChainlinkPricer.sol";
import "../Stabilizer/Stabilizer.sol";

contract GDAIAsset is Stabilizer {
    IGToken private immutable gDai;
    IERC20Metadata private immutable dai;
    IOpenTradesPnlFeed private immutable openTradesPnlFeed;

    // Variables
    uint256 public unlockEpoch;
    uint256 public divestStartTime;

    // Constants
    uint256 private constant GDAI_FREQUENCY = 1 days; // gDai frequency
    uint256 private constant DIVEST_DURATION = 2 days;
    uint256 private constant EPOCH_DURATION = 3 days;

    // Events
    event Request(uint256 gDaiAmount, uint256 epoch, uint256 startTime);

    // Errors
    error RequestNotAvailable();
    error EmptyBalance();
    error DivestNotAvailable();

    constructor(
        string memory name,
        address sweep,
        address usdx,
        address gDai_,
        address borrower
    ) Stabilizer(name, sweep, usdx, borrower) {
        gDai = IGToken(gDai_);
        dai = IERC20Metadata(gDai.asset());
        openTradesPnlFeed = IOpenTradesPnlFeed(gDai.openTradesPnlFeed());
    }

    /* ========== Views ========== */

    /**
     * @notice Current Value of investment.
     * @return total with 6 decimal to be compatible with dollar coins.
     */
    function currentValue() public view override returns (uint256) {
        uint256 accruedFeeInUSD = SWEEP.convertToUSD(accruedFee());
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
        uint256 usdxAmount = (daiBalance * 10 ** usdx.decimals()) /
            (10 ** dai.decimals());

        return usdxAmount;
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
            ? currentEpochStartTime + EPOCH_DURATION : currentEpochStartTime;
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
            ? divestStartTime : 0;
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
     * @dev get gDai from the usdx.
     */
    function invest(
        uint256 usdxAmount
    ) external onlyBorrower whenNotPaused validAmount(usdxAmount) {
        _invest(usdxAmount, 0);
    }

    /**
     * @notice Divest.
     * @param usdxAmount Amount to be divested.
     * @dev get usdx from the gDai.
     */
    function divest(
        uint256 usdxAmount
    ) external onlyBorrower validAmount(usdxAmount) {
        _divest(usdxAmount);
    }

    /**
     * @notice Reqest.
     * @param usdxAmount Amount to be divested.
     * @dev Send request to withdraw from gDai.
     */
    function request(uint256 usdxAmount) external onlyBorrower {
        (bool available, , ) = requestStatus();
        if (!available) revert RequestNotAvailable();
        if (gDai.balanceOf(address(this)) == 0) revert EmptyBalance();

        uint256 daiAmount = (usdxAmount * (10 ** gDai.decimals())) /
            (10 ** usdx.decimals());
        uint256 gDaiAmount = gDai.convertToShares(daiAmount);
        uint256 gDaiBalance = gDai.balanceOf(address(this));

        if (gDaiBalance < gDaiAmount) gDaiAmount = gDaiBalance;

        gDai.makeWithdrawRequest(gDaiAmount, address(this));

        uint256 epochsTimelock = gDai.withdrawEpochsTimelock();
        unlockEpoch = gDai.currentEpoch() + epochsTimelock;
        divestStartTime =
            gDai.currentEpochStart() + epochsTimelock * EPOCH_DURATION;

        emit Request(gDaiAmount, unlockEpoch, divestStartTime);
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external {
        _liquidate(address(gDai));
    }

    /* ========== Internals ========== */

    function _invest(uint256 usdxAmount, uint256) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(address(usdx), SWEEP.amm(), usdxAmount);
        uint256 daiAmount = amm().swapExactInput(
            address(usdx),
            address(dai),
            usdxAmount,
            0
        );
        TransferHelper.safeApprove(address(dai), address(gDai), daiAmount);
        gDai.deposit(daiAmount, address(this));

        emit Invested(daiAmount, 0);
    }

    function _divest(uint256 usdxAmount) internal override {
        (bool available, , ) = divestStatus();
        if (!available) revert DivestNotAvailable();

        uint256 daiAmount = (usdxAmount * (10 ** gDai.decimals())) /
            (10 ** usdx.decimals());
        uint256 gDaiAmount = gDai.convertToShares(daiAmount);
        uint256 gDaiBalance = gDai.balanceOf(address(this));

        if (gDaiBalance < gDaiAmount) gDaiAmount = gDaiBalance;
        daiAmount = gDai.redeem(gDaiAmount, address(this), address(this));

        TransferHelper.safeApprove(address(dai), SWEEP.amm(), daiAmount);
        uint256 divested = amm().swapExactInput(
            address(dai),
            address(usdx),
            daiAmount,
            0
        );

        emit Divested(divested, 0);
    }
}

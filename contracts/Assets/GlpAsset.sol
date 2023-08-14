// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= GlpAsset.sol =============================
// ====================================================================

/**
 * @title GLP Asset
 * @dev Representation of an on-chain investment on GMX
 */

import "./GMX/IGlpManager.sol";
import "./GMX/IRewardRouter.sol";
import "./GMX/IRewardTracker.sol";
import "../Stabilizer/Stabilizer.sol";

contract GlpAsset is Stabilizer {
    // Variables
    IRewardRouter private immutable rewardRouter;
    IGlpManager private immutable glpManager;
    IRewardTracker private immutable stakedGlpTracker;
    IRewardTracker private immutable feeGlpTracker;
    IERC20Metadata public immutable rewardToken;
    IPriceFeed private immutable oracleReward;

    uint256 private constant REWARDS_FREQUENCY = 1 days;

    // Events
    event Invested(uint256 indexed glpAmount);
    event Divested(uint256 indexed usdxAmount);
    event Collected(address reward, uint256 amount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _rewardRouter,
        address _oracleUsdx,
        address _oracleReward,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        oracleReward = IPriceFeed(_oracleReward);
        rewardRouter = IRewardRouter(_rewardRouter);
        glpManager = IGlpManager(rewardRouter.glpManager());
        stakedGlpTracker = IRewardTracker(rewardRouter.stakedGlpTracker());
        feeGlpTracker = IRewardTracker(rewardRouter.feeGlpTracker());
        rewardToken = IERC20Metadata(feeGlpTracker.rewardToken());
    }

    /* ========== Views ========== */

    /**
     * @notice Get Current Value
     * @return uint256.
     */
    function currentValue() public view override returns (uint256) {
        uint256 accruedFeeInUSD = sweep.convertToUSD(accruedFee());
        return assetValue() + super.currentValue() - accruedFeeInUSD;
    }

    /**
     * @notice Gets the current value in USDX of this OnChainAsset
     * @return the current usdx amount
     */
    function assetValue() public view returns (uint256) {
        // Get staked GLP value in USDX
        uint256 glpBalance = stakedGlpTracker.balanceOf(address(this));
        uint256 stakedInUsd = getUsdAmount(glpBalance);

        // Get reward in USD
        uint256 reward = feeGlpTracker.claimable(address(this));
        uint256 rewardInUsd = _oracleReardToUsd(reward);

        return stakedInUsd + rewardInUsd;
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest USDX
     * @param usdxAmount USDX Amount to be invested.
     */
    function invest(
        uint256 usdxAmount,
        uint256 slippage
    ) external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount) {
        _invest(usdxAmount, 0, slippage);
    }

    /**
     * @notice Divests From GMX.
     * Sends balance from the GMX to the Asset.
     * @param usdxAmount Amount to be divested.
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
     * @notice Withdraw Rewards from GMX.
     */
    function collect() public onlyBorrower whenNotPaused {
        emit Collected(
            address(rewardToken),
            feeGlpTracker.claimable(address(this))
        );

        feeGlpTracker.claim(msg.sender);
    }

    /**
     * @notice liquidate
     */
    function liquidate() external nonReentrant {
        collect();

        _liquidate(address(stakedGlpTracker));
    }

    function _invest(
        uint256 usdxAmount,
        uint256,
        uint256 slippage
    ) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(
            address(usdx),
            address(glpManager),
            usdxAmount
        );

        uint256 minOutUsdx = OvnMath.subBasisPoints(usdxAmount, slippage);
        uint256 minGlp = getGlpAmount(minOutUsdx);

        uint256 glpAmount = rewardRouter.mintAndStakeGlp(
            address(usdx),
            usdxAmount,
            minOutUsdx,
            minGlp
        );

        emit Invested(glpAmount);
    }

    function _divest(
        uint256 usdxAmount,
        uint256 slippage
    ) internal override returns (uint256 divestedAmount) {
        collect();
        uint256 glpBalance = stakedGlpTracker.balanceOf(address(this));
        uint256 glpAmount = getGlpAmount(usdxAmount);

        if (glpBalance < glpAmount) {
            glpAmount = glpBalance;
            usdxAmount = getUsdAmount(glpAmount);
        }

        divestedAmount = rewardRouter.unstakeAndRedeemGlp(
            address(usdx),
            glpAmount,
            OvnMath.subBasisPoints(usdxAmount, slippage),
            address(this)
        );

        emit Divested(divestedAmount);
    }

    // Get GLP price in usdx
    function getGlpPrice(bool maximise) internal view returns (uint256) {
        uint256 price = glpManager.getPrice(maximise); // True: maximum, False: minimum

        return (price * 10 ** usdx.decimals()) / glpManager.PRICE_PRECISION();
    }

    function getGlpAmount(uint256 usdxAmount) internal view returns (uint256) {
        uint256 glpPrice = getGlpPrice(false);

        return (usdxAmount * 10 ** stakedGlpTracker.decimals()) / glpPrice;
    }

    function getUsdAmount(uint256 glpAmount) internal view returns (uint256) {
        uint256 glpPrice = getGlpPrice(false);

        return (glpAmount * glpPrice) / (10 ** stakedGlpTracker.decimals());
    }

    function _oracleReardToUsd(
        uint256 rewardAmount
    ) internal view returns (uint256) {
        return
            ChainlinkLibrary.convertTokenToUsd(
                rewardAmount,
                rewardToken.decimals(),
                oracleReward
            );
    }
}

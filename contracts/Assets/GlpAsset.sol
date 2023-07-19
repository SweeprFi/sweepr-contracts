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
import "../Oracle/ChainlinkPricer.sol";

contract GlpAsset is Stabilizer {
    // Variables
    IRewardRouter private immutable rewardRouter;
    IGlpManager private immutable glpManager;
    IRewardTracker private immutable stakedGlpTracker;
    IRewardTracker private immutable feeGlpTracker;
    address private immutable rewardOracle;
    IERC20Metadata public immutable rewardToken;

    uint256 private constant REWARDS_FREQUENCY = 1 days;

    // Events
    event Invested(uint256 indexed glpAmount);
    event Divested(uint256 indexed usdxAmount);
    event Collected(address reward, uint256 amount);

    constructor(
        string memory name,
        address sweepAddress,
        address usdxAddress,
        address rewardRouterAddress,
        address rewardOracleAddress,
        address borrower
    ) Stabilizer(name, sweepAddress, usdxAddress, borrower) {
        rewardOracle = rewardOracleAddress;
        rewardRouter = IRewardRouter(rewardRouterAddress);
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
        uint256 glpPrice = getGlpPrice(false); // True: maximum, False: minimum
        uint256 glpBalance = stakedGlpTracker.balanceOf(address(this));
        uint256 stakedInUsd = (glpBalance * glpPrice) /
            10 ** stakedGlpTracker.decimals();

        // Get reward in USD
        uint256 reward = feeGlpTracker.claimable(address(this));
        (int256 price, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            rewardOracle,
            amm().sequencer(),
            REWARDS_FREQUENCY
        );

        uint256 rewardInUsd = (reward *
            uint256(price) *
            10 ** usdx.decimals()) /
            (10 ** (rewardToken.decimals() + decimals));

        return stakedInUsd + rewardInUsd;
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest USDX
     * @param usdxAmount USDX Amount to be invested.
     */
    function invest(
        uint256 usdxAmount
    ) external onlyBorrower whenNotPaused validAmount(usdxAmount) {
        _invest(usdxAmount, 0);
    }

    /**
     * @notice Divests From GMX.
     * Sends balance from the GMX to the Asset.
     * @param usdxAmount Amount to be divested.
     */
    function divest(
        uint256 usdxAmount
    ) external onlyBorrower validAmount(usdxAmount) {
        _divest(usdxAmount, 0);
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
    function liquidate() external {
        collect();

        _liquidate(address(stakedGlpTracker));
    }

    function _invest(uint256 usdxAmount, uint256) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(
            address(usdx),
            address(glpManager),
            usdxAmount
        );
        uint256 glpAmount = rewardRouter.mintAndStakeGlp(
            address(usdx),
            usdxAmount,
            0,
            0
        );

        emit Invested(glpAmount);
    }

    function _divest(uint256 usdxAmount, uint256) internal override {
        collect();

        uint256 glpPrice = getGlpPrice(false);
        uint256 glpBalance = stakedGlpTracker.balanceOf(address(this));
        uint256 glpAmount = (usdxAmount * 10 ** stakedGlpTracker.decimals()) /
            glpPrice;

        if (glpBalance < glpAmount) glpAmount = glpBalance;

        uint256 divested = rewardRouter.unstakeAndRedeemGlp(
            address(usdx),
            glpAmount,
            0,
            address(this)
        );

        emit Divested(divested);
    }

    // Get GLP price in usdx
    function getGlpPrice(bool maximise) internal view returns (uint256) {
        uint256 price = glpManager.getPrice(maximise); // True: maximum, False: minimum

        return (price * 10 ** usdx.decimals()) / glpManager.PRICE_PRECISION();
    }
}

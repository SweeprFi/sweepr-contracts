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
    address private immutable reward_oracle;
    IERC20Metadata public immutable reward_token;

    uint256 private constant REWARDS_FREQUENCY = 1 days;

    // Events
    event Collected(address reward, uint256 amount);

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _reward_router_address,
        address _reward_oracle_oracle_address,
        address _amm_address,
        address _borrower
    )
        Stabilizer(
            _name,
            _sweep_address,
            _usdx_address,
            _amm_address,
            _borrower
        )
    {
        reward_oracle = _reward_oracle_oracle_address;
        rewardRouter = IRewardRouter(_reward_router_address);
        glpManager = IGlpManager(rewardRouter.glpManager());
        stakedGlpTracker = IRewardTracker(rewardRouter.stakedGlpTracker());
        feeGlpTracker = IRewardTracker(rewardRouter.feeGlpTracker());
        reward_token = IERC20Metadata(feeGlpTracker.rewardToken());
    }

    /* ========== Views ========== */

    /**
     * @notice Get Current Value
     * @return uint256.
     */
    function currentValue() public view override returns (uint256) {
        return assetValue() + super.currentValue();
    }

    /**
     * @notice Gets the current value in USDX of this OnChainAsset
     * @return the current usdx amount
     */
    function assetValue() public view returns (uint256) {
        // Get staked GLP value in USDX
        uint256 glp_price = getGlpPrice(false); // True: maximum, False: minimum
        uint256 glp_balance = stakedGlpTracker.balanceOf(address(this));
        uint256 staked_in_usd = (glp_balance * glp_price) /
            10 ** stakedGlpTracker.decimals();

        // Get reward in USD
        uint256 reward = feeGlpTracker.claimable(address(this));
        (int256 price, uint8 decimals) = ChainlinkPricer.getLatestPrice(
            reward_oracle,
            sequencer_feed,
            REWARDS_FREQUENCY
        );

        uint256 reward_in_usd = (reward *
            uint256(price) *
            10 ** usdx.decimals()) /
            (10 ** (reward_token.decimals() + decimals));

        return staked_in_usd + reward_in_usd;
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest USDX
     * @param _usdx_amount USDX Amount to be invested.
     */
    function invest(
        uint256 _usdx_amount
    ) external onlyBorrower whenNotPaused validAmount(_usdx_amount) {
        _invest(_usdx_amount, 0);
    }

    /**
     * @notice Divests From GMX.
     * Sends balance from the GMX to the Asset.
     * @param _usdx_amount Amount to be divested.
     */
    function divest(
        uint256 _usdx_amount
    ) external onlyBorrower validAmount(_usdx_amount) {
        _divest(_usdx_amount);
    }

    /**
     * @notice Withdraw Rewards from GMX.
     */
    function collect() public onlyBorrower whenNotPaused {
        emit Collected(
            address(reward_token),
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

    function _invest(uint256 _usdx_amount, uint256) internal override {
        (uint256 usdx_balance, ) = _balances();
        _usdx_amount = _min(_usdx_amount, usdx_balance);

        TransferHelper.safeApprove(
            address(usdx),
            address(glpManager),
            _usdx_amount
        );
        rewardRouter.mintAndStakeGlp(address(usdx), _usdx_amount, 0, 0);

        emit Invested(_usdx_amount, 0);
    }

    function _divest(uint256 _usdx_amount) internal override {
        collect();

        uint256 glp_price = getGlpPrice(false);
        uint256 glp_balance = stakedGlpTracker.balanceOf(address(this));
        uint256 glp_amount = (_usdx_amount *
            10 ** stakedGlpTracker.decimals()) / glp_price;

        glp_amount = _min(glp_balance, glp_amount);

        rewardRouter.unstakeAndRedeemGlp(
            address(usdx),
            glp_amount,
            0,
            address(this)
        );

        emit Divested(glp_amount, 0);
    }

    // Get GLP price in usdx
    function getGlpPrice(bool _maximise) internal view returns (uint256) {
        uint256 price = glpManager.getPrice(_maximise); // True: maximum, False: minimum

        return (price * 10 ** usdx.decimals()) / glpManager.PRICE_PRECISION();
    }
}

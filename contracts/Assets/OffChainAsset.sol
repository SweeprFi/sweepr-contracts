// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= OffChainAsset.sol ========================
// ====================================================================

/**
 * @title Off Chain Asset
 * @dev Representation of an off-chain investment
 */

import "../Stabilizer/Stabilizer.sol";

contract OffChainAsset is Stabilizer {
    // Variables
    bool public redeemMode;
    uint256 public redeemAmount;
    uint256 public redeemTime;
    uint256 public actualValue;
    uint256 public valuationTime;
    address public wallet;
    address public collateralAgent;

    // Events
    event Payback(address token, uint256 amount);
    event CollateralAgentSet(address agent);
    error NotCollateralAgent();

    // Errors
    error NotEnoughAmount();

    modifier onlyCollateralAgent() {
        if (msg.sender != collateralAgency())
            revert NotCollateralAgent();
        _;
    }

    constructor(
        string memory name,
        address sweepAddress,
        address usdxAddress,
        address wallet_,
        address collateralAgent_,
        address borrower
    )
        Stabilizer(
            name,
            sweepAddress,
            usdxAddress,
            borrower
        )
    {
        wallet = wallet_;
        collateralAgent = collateralAgent_;
        redeemMode = false;
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
     * @notice Asset Value of investment.
     */
    function assetValue() public view returns (uint256) {
        return actualValue;
    }

    /**
     * @notice Get Collateral Agent Address
     * @return address
     */
    function collateralAgency() public view returns (address) {
        return
            collateralAgent != address(0) ? collateralAgent : sweep.owner();
    }

    /* ========== Actions ========== */

    /**
     * @notice Update wallet to send the investment to.
     * @param wallet_ New wallet address.
     */
    function setWallet(
        address wallet_
    ) external onlyBorrower onlySettingsEnabled {
        wallet = wallet_;
    }

    /**
     * @notice Set Collateral Agent
     * @param agentAddress.
     */
    function setCollateralAgent(
        address agentAddress
    ) external onlyBorrower validAddress(agentAddress) onlySettingsEnabled {
        collateralAgent = agentAddress;

        emit CollateralAgentSet(agentAddress);
    }

    /**
     * @notice Invest
     * @param usdxAmount USDX Amount to be invested.
     * @param sweepAmount SWEEP Amount to be invested.
     */
    function invest(
        uint256 usdxAmount,
        uint256 sweepAmount
    )
        external
        onlyBorrower
        whenNotPaused
        validAmount(usdxAmount)
        validAmount(sweepAmount)
    {
        _invest(usdxAmount, sweepAmount);
    }

    /**
     * @notice Divest
     * @param usdxAmount Amount to be divested.
     */
    function divest(
        uint256 usdxAmount
    ) external onlyBorrower validAmount(usdxAmount) {
        _divest(usdxAmount, 0);
    }

    /**
     * @notice Payback stable coins to Asset
     * @param token token address to payback. USDX, SWEEP ...
     * @param amount The amount of usdx to payback.
     */
    function payback(address token, uint256 amount) external {
        if (token != address(sweep) && token != address(usdx))
            revert InvalidToken();
        if (token == address(sweep)) amount = sweep.convertToUSD(amount);
        if (redeemAmount > amount) revert NotEnoughAmount();

        actualValue -= amount;
        redeemMode = false;
        redeemAmount = 0;

        TransferHelper.safeTransferFrom(
            token,
            msg.sender,
            address(this),
            amount
        );

        emit Payback(token, amount);
    }

    /**
     * @notice Update Value of investment.
     * @param value New value of investment.
     * @dev tracks the time when actualValue was updated.
     */
    function updateValue(uint256 value) external onlyCollateralAgent {
        actualValue = value;
        valuationTime = block.timestamp;
    }

    /* ========== Internals ========== */

    function _invest(
        uint256 usdxAmount,
        uint256 sweepAmount
    ) internal override {
        (uint256 usdxBalance, uint256 sweepBalance) = _balances();
        if(usdxBalance < usdxAmount) usdxAmount = usdxBalance;
        if(sweepBalance < sweepAmount) sweepAmount = sweepBalance;

        TransferHelper.safeTransfer(address(usdx), wallet, usdxAmount);
        TransferHelper.safeTransfer(address(sweep), wallet, sweepAmount);

        uint256 sweepInUSD = sweep.convertToUSD(sweepAmount);
        actualValue += usdxAmount;
        actualValue += sweepInUSD;
        valuationTime = block.timestamp;

        emit Invested(usdxAmount, sweepAmount);
    }

    function _divest(uint256 usdxAmount, uint256) internal override {
        redeemMode = true;
        redeemAmount = usdxAmount;
        redeemTime = block.timestamp;

        emit Divested(usdxAmount, 0);
    }
}

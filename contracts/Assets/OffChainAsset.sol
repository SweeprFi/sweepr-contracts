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
    event Invested(uint256 indexed usdxAmount, uint256 indexed sweepAmount);
    event Divested(uint256 indexed usdxAmount);
    event Payback(address token, uint256 amount);
    event CollateralAgentSet(address agent);

    // Errors
    error NotEnoughAmount();
    error NotCollateralAgent();

    modifier onlyCollateralAgent() {
        if (msg.sender != collateralAgency()) revert NotCollateralAgent();
        _;
    }

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _wallet,
        address _collateralAgent,
        address _oracleUsdx,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        if (_wallet == address(0)) revert ZeroAddressDetected();
        wallet = _wallet;
        collateralAgent = _collateralAgent;
        redeemMode = false;
    }

    /* ========== Views ========== */

    /**
     * @notice Asset Value of investment.
     */
    function assetValue() public view override returns (uint256) {
        return _oracleUsdxToUsd(actualValue);
    }

    /**
     * @notice Get Collateral Agent Address
     * @return address
     */
    function collateralAgency() public view returns (address) {
        return collateralAgent != address(0) ? collateralAgent : sweep.owner();
    }

    /* ========== Actions ========== */

    /**
     * @notice Update wallet to send the investment to.
     * @param _wallet New wallet address.
     */
    function setWallet(
        address _wallet
    ) external onlyBorrower onlySettingsEnabled {
        if (_wallet == address(0)) revert ZeroAddressDetected();
        wallet = _wallet;
    }

    /**
     * @notice Set Collateral Agent
     * @param _agentAddress.
     */
    function setCollateralAgent(
        address _agentAddress
    ) external onlyBorrower onlySettingsEnabled {
        if (_agentAddress == address(0)) revert ZeroAddressDetected();
        collateralAgent = _agentAddress;

        emit CollateralAgentSet(_agentAddress);
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
        nonReentrant
        validAmount(usdxAmount)
        validAmount(sweepAmount)
    {
        _invest(usdxAmount, sweepAmount, 0);
    }

    /**
     * @notice Divest
     * @param usdxAmount Amount to be divested.
     */
    function divest(
        uint256 usdxAmount
    )
        external
        onlyBorrower
        nonReentrant
        validAmount(usdxAmount)
    {
        _divest(usdxAmount, 0);
    }

    /**
     * @notice Payback stable coins to Asset
     * @param token token address to payback. USDX, SWEEP ...
     * @param amount The amount of usdx to payback.
     */
    function payback(address token, uint256 amount) external nonReentrant {
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
        uint256 sweepAmount,
        uint256
    ) internal override {
        (uint256 usdxBalance, uint256 sweepBalance) = _balances();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;
        if (sweepBalance < sweepAmount) sweepAmount = sweepBalance;

        TransferHelper.safeTransfer(address(usdx), wallet, usdxAmount);
        TransferHelper.safeTransfer(address(sweep), wallet, sweepAmount);

        uint256 sweepInUSD = sweep.convertToUSD(sweepAmount);
        actualValue += usdxAmount;
        actualValue += sweepInUSD;
        valuationTime = block.timestamp;

        emit Invested(usdxAmount, sweepAmount);
    }

    function _divest(
        uint256 usdxAmount,
        uint256
    ) internal override {
        redeemMode = true;
        redeemAmount = usdxAmount;
        redeemTime = block.timestamp;

        emit Divested(usdxAmount);
    }
}

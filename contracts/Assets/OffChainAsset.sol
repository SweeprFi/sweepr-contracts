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
    bool public redeem_mode;
    uint256 public redeem_amount;
    uint256 public redeem_time;
    uint256 public current_value;
    uint256 public valuation_time;
    address public wallet;
    address public collateral_agent;

    // Events
    event Payback(address token, uint256 amount);
    event CollateralAgentSet(address agent_address);

    // Errors
    error NotEnoughAmount();

    constructor(
        string memory _name,
        address _sweep_address,
        address _usdx_address,
        address _wallet,
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
        wallet = _wallet;
        redeem_mode = false;
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
     * @notice Asset Value of investment.
     */
    function assetValue() public view returns (uint256) {
        return current_value;
    }

    /**
     * @notice Get Collateral Agent Address
     * @return address
     */
    function collateral_agency() external view returns (address) {
        return
            collateral_agent != address(0) ? collateral_agent : SWEEP.owner();
    }

    /* ========== Actions ========== */

    /**
     * @notice Update wallet to send the investment to.
     * @param _wallet New wallet address.
     */
    function setWallet(
        address _wallet
    ) external onlyBorrower onlySettingsEnabled {
        wallet = _wallet;
    }

    /**
     * @notice Set Collateral Agent
     * @param _agent_address.
     */
    function setCollateralAgent(
        address _agent_address
    ) external onlyBorrower validAddress(_agent_address) {
        collateral_agent = _agent_address;

        emit CollateralAgentSet(_agent_address);
    }

    /**
     * @notice Invest
     * @param _usdx_amount USDX Amount to be invested.
     * @param _sweep_amount SWEEP Amount to be invested.
     */
    function invest(
        uint256 _usdx_amount,
        uint256 _sweep_amount
    )
        external
        onlyBorrower
        whenNotPaused
        validAmount(_usdx_amount)
        validAmount(_sweep_amount)
    {
        _invest(_usdx_amount, _sweep_amount);
    }

    /**
     * @notice Divest
     * @param _usdx_amount Amount to be divested.
     */
    function divest(
        uint256 _usdx_amount
    ) external onlyBorrower validAmount(_usdx_amount) {
        _divest(_usdx_amount);
    }

    /**
     * @notice Payback stable coins to Asset
     * @param _token token address to payback. USDX, SWEEP ...
     * @param _amount The amount of usdx to payback.
     */
    function payback(address _token, uint256 _amount) external {
        if (_token != sweep_address && _token != address(usdx))
            revert InvalidToken();
        if (_token == sweep_address) _amount = SWEEP.convertToUSD(_amount);
        if (redeem_amount > _amount) revert NotEnoughAmount();

        current_value -= _amount;
        redeem_mode = false;
        redeem_amount = 0;

        TransferHelper.safeTransferFrom(
            _token,
            msg.sender,
            address(this),
            _amount
        );

        emit Payback(_token, _amount);
    }

    /**
     * @notice Update Value of investment.
     * @param _value New value of investment.
     * @dev tracks the time when current_value was updated.
     */
    function updateValue(uint256 _value) external onlyCollateralAgent {
        current_value = _value;
        valuation_time = block.timestamp;
    }

    /* ========== Internals ========== */

    function _invest(
        uint256 _usdx_amount,
        uint256 _sweep_amount
    ) internal override {
        (uint256 usdx_balance, uint256 sweep_balance) = _balances();
        _usdx_amount = _min(_usdx_amount, usdx_balance);
        _sweep_amount = _min(_sweep_amount, sweep_balance);

        TransferHelper.safeTransfer(address(usdx), wallet, _usdx_amount);

        TransferHelper.safeTransfer(sweep_address, wallet, _sweep_amount);

        uint256 sweep_in_usd = SWEEP.convertToUSD(_sweep_amount);
        current_value += _usdx_amount;
        current_value += sweep_in_usd;
        valuation_time = block.timestamp;

        emit Invested(_usdx_amount, _sweep_amount);
    }

    function _divest(uint256 _usdx_amount) internal override {
        redeem_amount = _usdx_amount;
        redeem_mode = true;
        redeem_time = block.timestamp;

        emit Divested(_usdx_amount, 0);
    }
}

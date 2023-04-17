// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.16;

// ====================================================================
// ======================= SWEEP Dollar Coin (SWEEP) ==================
// ====================================================================


import "../Sweep/BaseSweep.sol";

contract SweepMock is BaseSweep {
    // Addresses
    address public collateral_agent;
    address public balancer;
    address public treasury;

    // Variables
    int256 public interest_rate; // 4 decimals of precision, e.g. 50000 = 5%
    int256 public step_value; // Amount to change SWEEP interest rate. 6 decimals of precision and default value is 2500 (0.25%)
    uint256 public period_start; // Start time for new period
    uint256 public period_time; // Period Time. Default = 604800 (7 days)
    uint256 public current_target_price; // The cuurent target price of SWEEP
    uint256 public next_target_price; // The next target price of SWEEP
    uint256 public current_amm_price; // The AMM price of SWEEP
    uint256 public arb_spread; // 4 decimals of precision, e.g. 1000 = 0.1%

    // Constants
    uint256 public constant GENESIS_SUPPLY = 10000e18;
    uint256 internal constant SPREAD_PRECISION = 1e6;

    address[] public minter_addresses;

    // Events
    event PeriodTimeSet(uint256 new_period_time);
    event PeriodStartSet(uint256 new_period_start);
    event ArbSpreadSet(uint256 new_arb_spread);
    event StepValueSet(int256 new_step_value);
    event InterestRateSet(int256 new_interest_rate);
    event BalancerSet(address balancer_address);
    event TreasurySet(address treasury_address);
    event CollateralAgentSet(address agent_address);
    event NewPeriodStarted(uint256 period_start);
    event AMMPriceSet(uint256 amm_price);
    event TargetPriceSet(uint256 current_target_price, uint256 next_target_price);

    // Errors

    error MintNotAllowed();
    error NotOwnerOrBalancer();
    error NotPassedPeriodTime();

    // Modifiers

    modifier onlyOwnerOrBalancer() {
        if (msg.sender != owner() && msg.sender != balancer)
            revert NotOwnerOrBalancer();
        _;
    }

    // Constructor
    function initialize()
        public 
        initializer 
    {
        BaseSweep.__Sweep_init(
            "SWEEP Dollar Coin",
            "SWEEP"
        );
        _mint(msg.sender, GENESIS_SUPPLY);

        interest_rate = 0;
        current_target_price = 1e6;
        next_target_price = 1e6;
        current_amm_price = 1e6;

        period_time = 604800; // 7 days
        step_value = 2500; // 0.25%
        arb_spread = 0;
    }

    /* ========== VIEWS ========== */

    /**
     * @notice Get Collateral Agent Address
     * @return address
     */
    function collateral_agency() external view returns (address) {
        if (collateral_agent != address(0)) {
            return collateral_agent;
        } else {
            return owner();
        }
    }

    /**
     * @notice Get Sweep Price
     * The Sweep Price comes from UniswapV3TWAPOracle.
     * @return uint256 Sweep price
     */
    function amm_price() public view returns (uint256) {
        return current_amm_price;
    }

    /**
     * @notice Get Sweep Target Price
     * Target Price will be used to peg the Sweep Price safely.
     * @return uint256 Sweep target price
     */
    function target_price() public view returns (uint256) {
        if (block.timestamp - period_start >= period_time) {
            // if over period, return next target price for new period
            return next_target_price;
        } else {
            // if in period, return current target price
            return current_target_price;
        }
    }

    /**
     * @notice Get Sweep Minting Allow Status
     * @return bool Sweep minting allow status
     */
    function is_minting_allowed() public view returns (bool) {
        uint256 arb_price = ((SPREAD_PRECISION - arb_spread) * target_price()) / SPREAD_PRECISION;
        return amm_price() >= arb_price ? true : false;
    }

    /* ========== Actions ========== */

    /**
     * @notice Mint (Override)
     * @param _minter Address of a minter.
     * @param _amount Amount for mint.
     */
    function minter_mint(address _minter, uint256 _amount)
        public
        override
        validMinter(msg.sender)
        whenNotPaused
    {
        if (!is_minting_allowed()) revert MintNotAllowed();

        super.minter_mint(_minter, _amount);
    }

    /**
     * @notice Set Period Time
     * @param _period_time.
     */
    function setPeriodTime(uint256 _period_time) external onlyOwner {
        period_time = _period_time;

        emit PeriodTimeSet(_period_time);
    }

    /**
     * @notice Set Interest Rate
     * @param _new_interest_rate.
     */
    function setInterestRate(int256 _new_interest_rate) external onlyOwnerOrBalancer {
        interest_rate = _new_interest_rate;

        emit InterestRateSet(_new_interest_rate);
    }

    /**
     * @notice Set Target Price
     * @param _current_target_price.
     * @param _next_target_price.
     */
    function setTargetPrice(uint256 _current_target_price, uint256 _next_target_price) external onlyOwnerOrBalancer {
        current_target_price = _current_target_price;
        next_target_price = _next_target_price;

        emit TargetPriceSet(_current_target_price, _next_target_price);
    }

    /**
     * @notice Set Balancer Address
     * @param _balancer.
     */
    function setBalancer(address _balancer) external onlyOwner {
        if (_balancer == address(0)) revert ZeroAddressDetected();
        balancer = _balancer;

        emit BalancerSet(_balancer);
    }

    /**
     * @notice Set Treasury Address
     * @param _treasury.
     */
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddressDetected();
        treasury = _treasury;

        emit TreasurySet(_treasury);
    }

    /**
     * @notice Set Collateral Agent
     * @param _agent_address.
     */
    function setCollateralAgent(address _agent_address) external onlyOwner {
        require(_agent_address != address(0), "Zero address detected");
        collateral_agent = _agent_address;

        emit CollateralAgentSet(_agent_address);
    }

    /**
     * @notice Set AMM price
     * @param _amm_price.
     */
    function setAMMPrice(uint256 _amm_price) public onlyOwner {
        current_amm_price = _amm_price;

        emit AMMPriceSet(_amm_price);
    }

    /**
     * @notice Set step value to change SWEEP interest rate
     * @param _new_step_value.
     */
    function setStepValue(int256 _new_step_value) external onlyOwner {
        step_value = _new_step_value;

        emit StepValueSet(_new_step_value);
    }

    /**
     * @notice Set arbitrage spread ratio
     * @param _new_arb_spread.
     */
    function setArbSpread(uint256 _new_arb_spread) external onlyOwner {
        arb_spread = _new_arb_spread;

        emit ArbSpreadSet(_new_arb_spread);
    }

    /**
     * @notice Start New Period
     */
    function startNewPeriod() external onlyOwnerOrBalancer {
        if (block.timestamp - period_start < period_time)
            revert NotPassedPeriodTime();

        period_start = block.timestamp;

        emit NewPeriodStarted(period_start);
    }
    
    /**
     * @notice SWEEP in USDX
     * Calculate the amount of USDX that are equivalent to the SWEEP input.
     * @param _amount Amount of SWEEP.
     * @return amount of USDX.
     */
    function convertToUSDX(uint256 _amount) external view returns (uint256) {
        return (_amount * target_price()) / 10**decimals();
    }

    /**
     * @notice USDX in SWEEP
     * Calculate the amount of SWEEP that are equivalent to the USDX input.
     * @param _amount Amount of USDX.
     * @return amount of SWEEP.
     */
    function convertToSWEEP(uint256 _amount) external view returns (uint256) {
        return (_amount * 10**decimals()) / target_price();
    }

    function getMinters() external view returns (address[] memory) {
        return minter_addresses;
    }

    /* ========== Actions ========== */

    /**
     * @notice Add Minter
     * Adds whitelisted minters.
     * @param _minter Address to be added.
     * @param _amount Max Amount for mint.
     */
    function addMinter(address _minter, uint256 _amount) public onlyOwner {
        if (_minter == address(0)) revert ZeroAddressDetected();
        if (_amount == 0) revert ZeroAmountDetected();
        if (minters[_minter].is_listed) revert MinterExist();

        minter_addresses.push(_minter);

        Minter memory new_minter = Minter({
            max_amount: _amount,
            minted_amount: 0,
            is_listed: true,
            is_enabled: true
        });
        minters[_minter] = new_minter;

        emit MinterAdded(_minter, new_minter);
    }

     /**
     * @notice Remove Minter
     * A minter will be removed from the list.
     * @param _minter Address to be removed.
     */
    function removeMinter(
        address _minter
    ) public onlyOwner validMinter(_minter) {
        delete minters[_minter]; // Delete minter from the mapping

        for (uint256 i = 0; i < minter_addresses.length; i++) {
            if (minter_addresses[i] == _minter) {
                minter_addresses[i] = minter_addresses[
                    minter_addresses.length - 1
                ];
                minter_addresses.pop();
                break;
            }
        }

        emit MinterRemoved(_minter);
    }
}
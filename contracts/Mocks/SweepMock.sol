// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.19;

// ====================================================================
// ======================= Sweep Coin (SWEEP) ==================
// ====================================================================

import "../Sweep/BaseSweep.sol";
import "../Stabilizer/IStabilizer.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract SweepMock is BaseSweep {
    using Math for uint256;
    
    // Addresses
    address public amm;
    address public balancer;
    address public treasury;

    // Variables
    int256 public interestRate; // 4 decimals of precision, e.g. 50000 = 5%
    int256 public stepValue; // Amount to change SWEEP interest rate. 6 decimals of precision and default value is 2500 (0.25%)
    uint256 public periodStart; // Start time for new period
    uint256 public periodTime; // Period Time. Default = 604800 (7 days)
    uint256 public currentTargetPrice; // The cuurent target price of SWEEP
    uint256 public nextTargetPrice; // The next target price of SWEEP
    uint256 public currentAmmPrice; // The AMM price of SWEEP
    uint256 public arbSpread; // 4 decimals of precision, e.g. 1000 = 0.1%
    uint256 public twaPrice;

    // Constants
    uint256 public constant GENESIS_SUPPLY = 10000e18;
    uint256 internal constant SPREAD_PRECISION = 1e6;

    // Events
    event PeriodTimeSet(uint256 newPeriodTime);
    event PeriodStartSet(uint256 newPeriodStart);
    event ArbSpreadSet(uint256 newArbSpread);
    event StepValueSet(int256 newStepValue);
    event InterestRateSet(int256 newInterestRate);
    event BalancerSet(address balancerAddress);
    event TreasurySet(address treasuryAddress);
    event CollateralAgentSet(address agentAddress);
    event NewPeriodStarted(uint256 periodStart);
    event AMMPriceSet(uint256 ammPrice);
    event TargetPriceSet(
        uint256 currentTargetPrice,
        uint256 nextTargetPrice
    );
    event WriteOff(uint256 newPrice);

    // Errors

    error MintNotAllowed();
    error WriteOffNotAllowed();
    error AlreadyExist();
    error NotOwnerOrBalancer();
    error NotPassedPeriodTime();

    // Modifiers

    modifier onlyBalancer() {
        if (msg.sender != owner() && msg.sender != balancer)
            revert NotOwnerOrBalancer();
        _;
    }

    // Constructor
    function initialize(
        address lzEndpoint,
        address fastMultisig,
        int256 stepValue_
    ) public initializer {
        BaseSweep.__Sweep_init(
            "SWEEP Coin",
            "SWEEP",
            lzEndpoint,
            fastMultisig
        );
        _mint(msg.sender, GENESIS_SUPPLY);

        stepValue = stepValue_;

        interestRate = 0;
        currentTargetPrice = 1e6;
        nextTargetPrice = 1e6;
        currentAmmPrice = 1e6;

        periodTime = 604800; // 7 days
        arbSpread = 0;

        twaPrice = 1e6;
    }

    /* ========== VIEWS ========== */

    /**
     * @notice Get Sweep Price
     * The Sweep Price comes from the AMM.
     * @return uint256 Sweep price
     */
    function ammPrice() public view returns (uint256) {
        return currentAmmPrice;
    }

    /**
     * @notice Get Sweep Target Price
     * Target Price will be used to peg the Sweep Price safely.
     * @return uint256 Sweep target price
     */
    function targetPrice() public view returns (uint256) {
        if (block.timestamp - periodStart >= periodTime) {
            // if over period, return next target price for new period
            return nextTargetPrice;
        } else {
            // if in period, return current target price
            return currentTargetPrice;
        }
    }

    /**
     * @notice Get Sweep Minting Allow Status
     * @return bool Sweep minting allow status
     */
    function isMintingAllowed() public view returns (bool) {
        uint256 arbPrice = ((SPREAD_PRECISION - arbSpread) * targetPrice()) /
            SPREAD_PRECISION;
        return ammPrice() >= arbPrice;
    }

    /* ========== Actions ========== */

    function setAMM(address ammAddress) external {
        amm = ammAddress;
    }

    /**
     * @notice Mint (Override)
     * @param minter Address of a minter.
     * @param amount Amount for mint.
     */
    function minterMint(
        address minter,
        uint256 amount
    ) public override validMinter(msg.sender) whenNotPaused {
        if (!isMintingAllowed()) revert MintNotAllowed();

        super.minterMint(minter, amount);
    }

    /**
     * @notice Set Period Time
     * @param periodTime_.
     */
    function setPeriodTime(uint256 periodTime_) external onlyGov {
        periodTime = periodTime_;

        emit PeriodTimeSet(periodTime_);
    }

    /**
     * @notice Set Interest Rate
     * @param newInterestRate.
     */
    function setInterestRate(
        int256 newInterestRate
    ) external onlyBalancer {
        interestRate = newInterestRate;

        emit InterestRateSet(newInterestRate);
    }

    /**
     * @notice Set Target Price
     * @param currentTargetPrice_.
     * @param nextTargetPrice_.
     */
    function setTargetPrice(
        uint256 currentTargetPrice_,
        uint256 nextTargetPrice_
    ) external onlyBalancer {
        currentTargetPrice = currentTargetPrice_;
        nextTargetPrice = nextTargetPrice_;

        emit TargetPriceSet(currentTargetPrice_, nextTargetPrice_);
    }

    /**
     * @notice Set Balancer Address
     * @param balancer_.
     */
    function setBalancer(address balancer_) external onlyGov {
        if (balancer_ == address(0)) revert ZeroAddressDetected();
        balancer = balancer_;

        emit BalancerSet(balancer_);
    }

    /**
     * @notice Set AMM price
     * @param ammPrice_.
     */
    function setAMMPrice(uint256 ammPrice_) public onlyGov {
        currentAmmPrice = ammPrice_;

        emit AMMPriceSet(ammPrice_);
    }

    /**
     * @notice Set arbitrage spread ratio
     * @param newArbSpread.
     */
    function setArbSpread(uint256 newArbSpread) external onlyGov {
        arbSpread = newArbSpread;

        emit ArbSpreadSet(newArbSpread);
    }

    /**
     * @notice Set Treasury Address
     * @param treasury_.
     */
    function setTreasury(address treasury_) external onlyMultisigOrGov {
        if (treasury_ == address(0)) revert ZeroAddressDetected();
        if (treasury != address(0)) revert AlreadyExist();
        treasury = treasury_;

        emit TreasurySet(treasury_);
    }

    /**
     * @notice Start New Period
     */
    function startNewPeriod() external onlyBalancer {
        if (block.timestamp - periodStart < periodTime)
            revert NotPassedPeriodTime();

        periodStart = block.timestamp;

        emit NewPeriodStarted(periodStart);
    }

    /**
     * @notice Write Off
     * @param newPrice.
     */
    function writeOff(uint256 newPrice) external onlyGov whenPaused {
        if (targetPrice() < ammPrice()) revert WriteOffNotAllowed();
        uint256 multiplier = SPREAD_PRECISION.mulDiv(targetPrice(), newPrice);
        uint256 len = minterAddresses.length;

        for (uint256 i = 0; i < len; ) {
            IStabilizer stabilizer = IStabilizer(minterAddresses[i]);
            uint256 sweepAmount = stabilizer.sweepBorrowed();
            if (sweepAmount > 0) {
                sweepAmount = sweepAmount.mulDiv(multiplier, SPREAD_PRECISION);
                stabilizer.updateSweepBorrowed(sweepAmount);
            }

            unchecked {
                ++i;
            }
        }
        
        currentTargetPrice = newPrice;

        emit WriteOff(newPrice);
    }

    /**
     * @notice SWEEP in USDX
     * Calculate the amount of USDX that are equivalent to the SWEEP input.
     * @param amount Amount of SWEEP.
     * @return amount of USDX.
     */
    function convertToUSD(uint256 amount) external view returns (uint256) {
        return (amount * targetPrice()) / 10 ** decimals();
    }

    /**
     * @notice USDX in SWEEP
     * Calculate the amount of SWEEP that are equivalent to the USDX input.
     * @param amount Amount of USDX.
     * @return amount of SWEEP.
     */
    function convertToSWEEP(uint256 amount) external view returns (uint256) {
        return (amount * 10 ** decimals()) / targetPrice();
    }

    /* ========== Actions ========== */
    function setTWAPrice(uint256 twaPrice_) public {
        twaPrice = twaPrice_;
    }
}

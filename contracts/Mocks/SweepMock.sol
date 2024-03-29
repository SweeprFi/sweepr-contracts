// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.19;

// ====================================================================
// ======================= Sweep Coin (SWEEP) ==================
// ====================================================================

import "../Sweep/BaseSweep.sol";
import "../Stabilizer/IStabilizer.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../AMM/IAMM.sol";

contract SweepMock is BaseSweep {
    using Math for uint256;
    
    // Addresses
    address public amm;
    address public balancer;
    address public treasury;

    // Variables
    int256 public currentInterestRate; // 4 decimals of precision, e.g. 50000 = 5%
    int256 public nextInterestRate;
    int256 public stepValue; // Amount to change SWEEP interest rate. 4 decimals of precision and default value is 2500 (0.25%)

    uint256 public currentPeriodStart; // Start time for new period
    uint256 public nextPeriodStart; // Start time for new period
    uint256 public currentTargetPrice; // The cuurent target price of SWEEP
    uint256 public nextTargetPrice; // The next target price of SWEEP
    uint256 public arbSpread; // 4 decimals of precision, e.g. 1000 = 0.1%

    uint256 public currentAmmPrice; // The AMM price of SWEEP
    uint256 public twaPrice;

    // Constants
    uint256 public constant GENESIS_SUPPLY = 10000000e18;
    uint256 internal constant SPREAD_PRECISION = 1e6;

    // Events
    event ArbSpreadSet(uint256 newArbSpread);
    event StepValueSet(int256 newStepValue);
    event InterestRateRefreshed(int256 newInterestRate, uint256 newPeriodStart);
    event BalancerSet(address balancerAddress);
    event TreasurySet(address treasuryAddress);
    event CollateralAgentSet(address agentAddress);
    event AMMPriceSet(uint256 ammPrice);
    event TargetPriceSet(uint256 newCurrentTargetPrice, uint256 newNextTargetPrice);
    event InterestRateSet(int256 newCurrentInterestRate, int256 newNextInterestrate);
    event PeriodStartSet(uint256 newCurrentPeriodStart, uint256 newNextPeriodStart);
    event WriteOff(uint256 newPrice);

    // Errors

    error MintNotAllowed();
    error WriteOffNotAllowed();
    error AlreadyExist();
    error NotOwnerOrBalancer();
    error OldPeriodStart();
    error OutOfRateRange();
    error LessTargetPrice();
    error OutOfTargetPriceChange();
    error InvalidPeriodStart();

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

        currentInterestRate = 0;
        nextInterestRate = 0;

        currentTargetPrice = 1e6;
        nextTargetPrice = 1e6;
        currentAmmPrice = 1e6;
        twaPrice = 1e6;

        currentPeriodStart = block.timestamp;
        nextPeriodStart = currentPeriodStart + 1 days;

        arbSpread = 1000; // 0.1%
    }

    /* ========== VIEWS ========== */

    /**
     * @notice Get Sweep Price
     * The Sweep Price comes from the AMM.
     * @return uint256 Sweep price
     */
    function ammPrice() public view returns (uint256) {
        if(amm != address(0)) return IAMM(amm).getPrice();
        return currentAmmPrice;
    }

    /**
     * @notice Get Sweep Interest Rate
     * @return uint256 Sweep Interest Rate
     */
    function interestRate() public view returns (int256) {
        if (block.timestamp < nextPeriodStart) {
            return currentInterestRate;
        } else {
            return nextInterestRate;
        }
    }

    /**
     * @notice Get Sweep Target Price
     * Target Price will be used to peg the Sweep Price safely.
     * @return uint256 Sweep target price
     */
    function targetPrice() public view returns (uint256) {
        uint256 accumulatedRate;

        if (interestRate() >= 0) {
            accumulatedRate = SPREAD_PRECISION + uint256(interestRate()) * daysInterest();
        } else {
            accumulatedRate = SPREAD_PRECISION - uint256(-interestRate()) * daysInterest();
        }

        if (block.timestamp < nextPeriodStart) {
            return (currentTargetPrice * accumulatedRate) / SPREAD_PRECISION;
        } else {
            return (nextTargetPrice * accumulatedRate) / SPREAD_PRECISION;
        }
    }

    /**
     * @notice Get Sweep Period Start
     * @return uint256 Sweep Period Start
     */
    function periodStart() external view returns (uint256) {
        if (block.timestamp < nextPeriodStart) {
            return currentPeriodStart;
        } else {
            return nextPeriodStart;
        }
    }

    function daysInterest() public view returns (uint256) {
        if (block.timestamp < nextPeriodStart) {
            return (block.timestamp - currentPeriodStart) / 1 days;
        } else {
            return (block.timestamp - nextPeriodStart ) / 1 days;
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
     * @param amount Amount for mint.
     */
    function mint(
        uint256 amount
    ) public override validMinter(msg.sender) whenNotPaused {
        if (!isMintingAllowed()) revert MintNotAllowed();

        super.mint(amount);
    }

        /**
     * @notice Set Interest Rate
     * @param dailyRate.
     * @param newPeriodStart.
     */
    function refreshInterestRate(int256 dailyRate, uint256 newPeriodStart) external onlyBalancer {
        // newPeriodStart should be after current block time.
        if (newPeriodStart < block.timestamp) revert OldPeriodStart();
        // dailyRate should be less than 0.1% and larger than -0.01%
        if (dailyRate < -100 || dailyRate >= 1000) revert OutOfRateRange();

        if (block.timestamp >= nextPeriodStart) {
            currentInterestRate = nextInterestRate;
            currentTargetPrice = nextTargetPrice;
            currentPeriodStart = nextPeriodStart;
        }

        nextInterestRate = dailyRate;
        nextPeriodStart = newPeriodStart;

        uint256 interestTime = SPREAD_PRECISION * (nextPeriodStart - currentPeriodStart);
        uint256 accumulatedRate;

        if (currentInterestRate >= 0) {
            accumulatedRate = SPREAD_PRECISION + (uint256(currentInterestRate) * interestTime) / (1 days * SPREAD_PRECISION);
        } else {
            accumulatedRate = SPREAD_PRECISION - (uint256(-currentInterestRate) * interestTime) / (1 days * SPREAD_PRECISION);
        }

        nextTargetPrice = (currentTargetPrice * accumulatedRate) / SPREAD_PRECISION;

        emit InterestRateRefreshed(dailyRate, newPeriodStart);
    }


    /**
     * @notice Set Target Price
     * @param newCurrentTargetPrice.
     * @param newNextTargetPrice.
     */
    function setTargetPrice(
        uint256 newCurrentTargetPrice, 
        uint256 newNextTargetPrice
    ) external onlyBalancer {
        currentTargetPrice = newCurrentTargetPrice;
        nextTargetPrice = newNextTargetPrice;

        emit TargetPriceSet(newCurrentTargetPrice, newNextTargetPrice);
    }

    /**
     * @notice Set Interest Rate
     * @param newCurrentInterestRate.
     * @param newNextInterestRate.
     */
    function setInterestRate(
        int256 newCurrentInterestRate, 
        int256 newNextInterestRate
    ) external onlyBalancer {
        currentInterestRate = newCurrentInterestRate;
        nextInterestRate = newNextInterestRate;

        emit InterestRateSet(newCurrentInterestRate, newNextInterestRate);
    }

    /**
     * @notice Set Period Start
     * @param newCurrentPeriodStart.
     * @param newNextPeriodStart.
     */
    function setPeriodStart(
        uint256 newCurrentPeriodStart, 
        uint256 newNextPeriodStart
    ) external onlyBalancer {
        if (newCurrentPeriodStart > newNextPeriodStart) 
            revert InvalidPeriodStart();

        currentPeriodStart = newCurrentPeriodStart;
        nextPeriodStart = newNextPeriodStart;

        emit PeriodStartSet(newCurrentPeriodStart, newNextPeriodStart);
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
     * @notice Set step value to change SWEEP interest rate
     * @param newStepValue.
     */
    function setStepValue(int256 newStepValue) external onlyGov {
        stepValue = newStepValue;

        emit StepValueSet(newStepValue);
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
     * @notice Write Off
     * @param newPrice.
     */
    function writeOff(uint256 newPrice, address insolventDebtor) external onlyGov whenPaused {
        if (targetPrice() < ammPrice()) revert WriteOffNotAllowed();
        uint256 multiplier = SPREAD_PRECISION.mulDiv(targetPrice(), newPrice);
        uint256 len = minterAddresses.length;

        for (uint256 i = 0; i < len; ) {
            address minterAddress = minterAddresses[i];
            if(insolventDebtor != minterAddress) {
                IStabilizer stabilizer = IStabilizer(minterAddress);
                uint256 sweepAmount = stabilizer.sweepBorrowed();
                if (sweepAmount > 0) {
                    sweepAmount = sweepAmount.mulDiv(multiplier, SPREAD_PRECISION);
                    stabilizer.updateSweepBorrowed(sweepAmount);
                }
            }

            unchecked { ++i; }
        }
        
        currentTargetPrice = newPrice;
        nextTargetPrice = newPrice;

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

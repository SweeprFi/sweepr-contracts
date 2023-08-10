// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ======================= SWEEP Coin (SWEEP) =========================
// ====================================================================

import "./BaseSweep.sol";
import "../AMM/IAMM.sol";
import "../Stabilizer/IStabilizer.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract SweepCoin is BaseSweep {
    using Math for uint256;

    IAMM public amm;

    // Addresses
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

    // Constants
    uint256 internal constant SPREAD_PRECISION = 1e6;

    /* ========== Events ========== */

    event ArbSpreadSet(uint256 newArbSpread);
    event InterestRateSet(int256 newInterestRate, uint256 newPeriodStart);
    event AMMSet(address ammAddress);
    event BalancerSet(address balancerAddress);
    event TreasurySet(address treasuryAddress);
    event TargetPriceSet(uint256 currentTargetPrice);
    event WriteOff(uint256 newPrice);

    /* ========== Errors ========== */

    error MintNotAllowed();
    error WriteOffNotAllowed();
    error NotOwnerOrBalancer();
    error NotBalancer();
    error AlreadyExist();
    error OldPeriodStart();
    error OutOfRateRange();
    error LessTargetPrice();
    error OutOfTargetPriceChange();

    /* ======= MODIFIERS ====== */

    modifier onlyBalancer() {
        if (msg.sender != balancer) revert NotBalancer();
        _;
    }

    // Constructor
    function initialize(
        address lzEndpoint,
        address fastMultisig,
        int256 stepValue_
    ) public initializer {
        if (fastMultisig == address(0)) revert ZeroAddressDetected();
        
        BaseSweep.__Sweep_init("SweepCoin", "SWEEP", lzEndpoint, fastMultisig);

        stepValue = stepValue_;
        currentInterestRate = 0;
        nextInterestRate = 0;

        currentTargetPrice = 1e6;
        nextTargetPrice = 1e6;

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
        return amm.getPrice();
    }

    /**
     * @notice Get Sweep Time Weighted Average Price
     * The Sweep Price comes from the AMM.
     * @return uint256 Sweep price
     */
    function twaPrice() external view returns (uint256) {
        return amm.getTWAPrice();
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
     * It must have 6 decimals as USD_DECIMALS in IAMM.
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

    /**
     * @notice Get Sweep Minting Allow Status
     * @return bool Sweep minting allow status
     */
    function isMintingAllowed() public view returns (bool) {
        uint256 arbPrice = ((SPREAD_PRECISION - arbSpread) * targetPrice()) /
            SPREAD_PRECISION;
        return (ammPrice() >= arbPrice);
    }

    function daysInterest() public view returns (uint256) {
        if (block.timestamp < nextPeriodStart) {
            return (block.timestamp - currentPeriodStart) / 1 days;
        } else {
            return (block.timestamp - nextPeriodStart ) / 1 days;
        }
    }

    /* ========== Actions ========== */

    /**
     * @notice Mint (Override)
     * @param amount Amount for mint.
     */
    function mint(
        uint256 amount
    ) public override validMinter(msg.sender) whenNotPaused {
        if (address(amm) != address(0) && !isMintingAllowed())
            revert MintNotAllowed();

        super.mint(amount);
    }

    /**
     * @notice Set Balancer Address
     * @param newBalancer.
     */
    function setBalancer(address newBalancer) external onlyGov {
        if (newBalancer == address(0)) revert ZeroAddressDetected();
        balancer = newBalancer;

        emit BalancerSet(newBalancer);
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
     * @notice Set AMM
     * @param ammAddress.
     */
    function setAMM(address ammAddress) external onlyGov {
        if (ammAddress == address(0)) revert ZeroAddressDetected();
        amm = IAMM(ammAddress);

        emit AMMSet(ammAddress);
    }

    /**
     * @notice Set Interest Rate
     * @param dailyRate.
     * @param newPeriodStart.
     */
    function setInterestRate(int256 dailyRate, uint256 newPeriodStart) external onlyBalancer {
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

        emit InterestRateSet(dailyRate, newPeriodStart);
    }

    /**
     * @notice Set Target Price
     * @param newCurrentTargetPrice.
     */
    function setTargetPrice(uint256 newCurrentTargetPrice) external onlyBalancer {
        // newCurrentTargetPrice should be bigger than currentTargetPrice
        if (newCurrentTargetPrice < currentTargetPrice) revert LessTargetPrice();
        // Up to 2% price change is allowed
        if (((newCurrentTargetPrice - currentTargetPrice) * SPREAD_PRECISION) / currentTargetPrice > 20000)
            revert OutOfTargetPriceChange();

        currentTargetPrice = newCurrentTargetPrice;

        emit TargetPriceSet(newCurrentTargetPrice);
    }

    /**
     * @notice Set Treasury Address
     * @param newTreasury.
     */
    function setTreasury(address newTreasury) external onlyGov {
        if (newTreasury == address(0)) revert ZeroAddressDetected();
        if (treasury != address(0)) revert AlreadyExist();
        treasury = newTreasury;

        emit TreasurySet(newTreasury);
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
        nextTargetPrice = newPrice;

        emit WriteOff(newPrice);
    }

    /**
     * @notice SWEEP in USD
     * Calculate the amount of USDX that are equivalent to the SWEEP input.
     * @param sweepAmount Amount of SWEEP.
     * @return usdAmount of USDX.
     */
    function convertToUSD(
        uint256 sweepAmount
    ) external view returns (uint256 usdAmount) {
        usdAmount = sweepAmount.mulDiv(targetPrice(), 10 ** decimals());
    }

    /**
     * @notice USD in SWEEP
     * Calculate the amount of SWEEP that are equivalent to the USDX input.
     * @param usdAmount Amount of USDX.
     * @return sweepAmount of SWEEP.
     */
    function convertToSWEEP(
        uint256 usdAmount
    ) external view returns (uint256 sweepAmount) {
        sweepAmount = usdAmount.mulDiv(10 ** decimals(), targetPrice());
    }
}

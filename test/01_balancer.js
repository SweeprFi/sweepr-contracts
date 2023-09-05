const { expect } = require("chai");
const { ethers } = require("hardhat");
const { increaseTime, toBN, Const, getBlockTimestamp } = require("../utils/helper_functions");

contract("Balancer", async function () {
	before(async () => {
		[owner, multisig, lzEndpoint, stab_1, stab_2, stab_3, stab_4, stab_5] = await ethers.getSigners();

		ZERO = 0;
		PRECISION = 1e10
		targetPrice = toBN("1", 6);
		loanLimit = toBN("100", 6);
		NEW_loanLimit = toBN("150", 6);

		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepCoin");
		SweepProxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
			owner.address,
			750 // 0.00274% daily rate = 1% yearly rate
		]);
		sweep = await SweepProxy.deployed();

		Balancer = await ethers.getContractFactory("Balancer");
		balancer = await Balancer.deploy(sweep.address, lzEndpoint.address,);

		// AMM
		Uniswap = await ethers.getContractFactory("UniswapMock");
		amm = await Uniswap.deploy(sweep.address, Const.FEE);
		await sweep.setAMM(amm.address);

		await sweep.setBalancer(balancer.address);
		stabilizers = [stab_1.address, stab_2.address, stab_3.address, stab_4.address]
		stabilizers.forEach(async (address) => {
			await sweep.addMinter(address, loanLimit);
		});
	});

	async function getNextTargetPrice() {
		currentTargetPrice = await sweep.currentTargetPrice();
		currentInterestRate = await sweep.currentInterestRate();

		currentPeriodStart = await sweep.currentPeriodStart();
		nextPeriodStart = await sweep.nextPeriodStart();

		interestTime = PRECISION * (nextPeriodStart - currentPeriodStart);
        accumulatedRate = PRECISION + (currentInterestRate * interestTime) / (86400 * PRECISION); // 86400s = 1 day
		nextTargetPrice = Math.floor((currentTargetPrice * accumulatedRate) / PRECISION);
		return nextTargetPrice;
	}

	it('increases the interest rate because the TWA price is lower', async () => {
		// Set arbspread and twaPrice to increase interest rate
		await sweep.setArbSpread(300);
		await amm.setTWAPrice(999600);
		
		period = 604800; // 7 days
		stepValue = await sweep.stepValue()

		// new interest rate = stepValue(750), because currentInterestRate = 0
		newInterestRate = stepValue;
		nextTargetPrice = await sweep.nextTargetPrice();
		nextPeriodStart = await sweep.nextPeriodStart();

		await expect(balancer.setPeriod(Const.ZERO))
			.to.be.revertedWithCustomError(balancer, "ZeroAmount");

		// advance 2 days to start new period
		await increaseTime(Const.DAY * 1);
		// set period to 7 days in balancer
		await balancer.setPeriod(period);

		/*------- Start 1st period ------*/
		await balancer.refreshInterestRate();

		expect(await sweep.currentInterestRate()).to.be.equal(Const.ZERO);
		expect(await sweep.nextInterestRate()).to.be.equal(newInterestRate);
		expect(await sweep.currentTargetPrice()).to.be.equal(nextTargetPrice);
		expect(await sweep.currentPeriodStart()).to.be.equal(nextPeriodStart);
		expect(await sweep.nextPeriodStart()).to.be.equal(nextPeriodStart.add(Const.DAY * 7));

		// advance 7 days to start 2nd period
		await increaseTime(Const.DAY * 7);

		interestRate = await sweep.interestRate();
		newInterestRate = interestRate.add(stepValue);
		nextInterestRate = await sweep.nextInterestRate();
		nextTargetPrice = await sweep.nextTargetPrice();
		nextPeriodStart = await sweep.nextPeriodStart();

		/*------- Start 2nd period ------*/
		await balancer.refreshInterestRate();

		expect(await sweep.currentInterestRate()).to.be.equal(nextInterestRate);
		expect(await sweep.nextInterestRate()).to.be.equal(newInterestRate);
		expect(await sweep.currentTargetPrice()).to.be.equal(nextTargetPrice);
		expect(await sweep.currentPeriodStart()).to.be.equal(nextPeriodStart);
		expect(await sweep.nextPeriodStart()).to.be.equal(nextPeriodStart.add(Const.DAY * 7));

		nextTargetPrice = await getNextTargetPrice();
		expect(await sweep.nextTargetPrice()).to.be.equal(nextTargetPrice);

		// advance 3 days to calculate target price
		await increaseTime(Const.DAY * 3);

		currentTargetPrice = await sweep.currentTargetPrice();
		interestRate = await sweep.interestRate();
		daysInterest = await sweep.daysInterest();

		expect(daysInterest).to.be.equal(3);

		accumulatedRate = PRECISION + interestRate * daysInterest;
		targetPrice = Math.floor((currentTargetPrice * accumulatedRate) / PRECISION);

		expect(await sweep.targetPrice()).to.be.equal(targetPrice);
	});

	it('decreases the interest rate because the TWA price is higher', async () => {
		await amm.setTWAPrice(1100000);
		// advance 4 days for new period
		await increaseTime(Const.DAY * 4);

		interestRate = await sweep.interestRate();
		newInterestRate = interestRate - stepValue;

		/*------- Start 3rd period ------*/
		await balancer.refreshInterestRate();

		expect(await sweep.nextInterestRate()).to.be.equal(newInterestRate);

		// advance 7 days for new period
		await increaseTime(Const.DAY * 7); // 7 days

		nextTargetPrice = await sweep.nextTargetPrice();
		interestRate = await sweep.interestRate();
		newInterestRate = interestRate - stepValue;

		/*------- Start 4th period ------*/
		await balancer.refreshInterestRate();

		expect(await sweep.nextInterestRate()).to.be.equal(newInterestRate);
		expect(await sweep.targetPrice()).to.be.equal(nextTargetPrice);
		expect(await sweep.currentTargetPrice()).to.be.equal(nextTargetPrice);

		nextTargetPrice = await getNextTargetPrice();
		expect(await sweep.nextTargetPrice()).to.equal(nextTargetPrice);
	});

	it('sets a negative interest rate and decreaces the next target price', async () => {
		await increaseTime(Const.DAY * 7); // 7 days

		interestRate = await sweep.interestRate();
		newInterestRate = interestRate - stepValue; // -0.0005%

		expect(newInterestRate).to.lessThan(Const.ZERO);

		next_tp = await sweep.nextTargetPrice();

		/*------- Start 5th period ------*/
		await balancer.refreshInterestRate();

		expect(await sweep.nextInterestRate()).to.be.equal(newInterestRate);
		expect(await sweep.currentInterestRate()).to.be.equal(Const.ZERO);
		expect(await sweep.currentTargetPrice()).to.be.equal(next_tp);

		nextTargetPrice = await getNextTargetPrice();
		expect(await sweep.nextTargetPrice()).to.be.equal(nextTargetPrice);

		await increaseTime(Const.DAY * 7); // 7 days

		expect(await sweep.interestRate()).to.be.equal(newInterestRate);

		/*------- Start 6th period ------*/
		await balancer.refreshInterestRate();
		expect(await sweep.currentInterestRate()).to.lessThan(Const.ZERO);

		currentTargetPrice = await sweep.currentTargetPrice();
		nextTargetPrice = await getNextTargetPrice();

		// check nextTargetPrice < currentTargetPrice if interest < 0
		expect(nextTargetPrice).to.lessThan(currentTargetPrice);

		// advance 4 days to calculate target price
		await increaseTime(Const.DAY * 4); // 4 days

		currentTargetPrice = await sweep.currentTargetPrice();
		interestRate = await sweep.interestRate();
		daysInterest = await sweep.daysInterest();

		expect(interestRate).to.lessThan(Const.ZERO);
		expect(daysInterest).to.be.equal(4);

		accumulatedRate = PRECISION + interestRate * daysInterest;
		targetPrice = Math.floor((currentTargetPrice * accumulatedRate) / PRECISION);

		// check targetPrice < currentTargetPrice if interest < 0
		expect(await sweep.currentTargetPrice()).to.greaterThan(targetPrice);
	});

	it('set minus interest rate ', async () => {
		// advance 4 days for new period
		await increaseTime(Const.DAY * 3); // 3 days 

		interestRate = await sweep.interestRate();
		newInterestRate = interestRate - stepValue;

		expect(newInterestRate).to.be.equal(-2250);
	});

	it('reverts refresh interest rate when caller is not sweep owner', async () => {
		await expect(balancer.connect(multisig).refreshInterestRate())
			.to.be.revertedWithCustomError(sweep, 'NotMultisigOrGov');
	});

	it('adds stabilizers to the amounts map', async () => {
		amounts = [loanLimit, loanLimit, loanLimit, loanLimit];

		stabilizers.forEach(async (address) => {
			expect(await balancer.amounts(address)).to.be.equal(0);
		});

		await expect(balancer.addActions(stabilizers, []))
			.to.be.revertedWithCustomError(balancer, 'WrongDataLength');

		await balancer.addActions(stabilizers, amounts);

		stabilizers.forEach(async (address) => {
			expect(await balancer.amounts(address)).to.be.equal(loanLimit);
		});

		await balancer.addAction(stab_4.address, NEW_loanLimit);
		expect(await balancer.amounts(stab_4.address)).to.be.equal(NEW_loanLimit);

		expect(await balancer.index()).to.be.equal(5);
	});

	it('removes stabilizers form the amounts map', async () => {
		await balancer.removeAction(stab_4.address);
		expect(await balancer.amounts(stab_4.address)).to.be.equal(0);

		await balancer.reset();
		stabilizers.forEach(async (address) => {
			expect(await balancer.amounts(address)).to.be.equal(0);
			expect(await balancer.index()).to.be.equal(0);
		});
	});

	it('sets a new Sweep interest rate', async () => {
		interest = 5000000;

		currentBlockTime = await getBlockTimestamp();
		newPeriodStart = currentBlockTime + Const.DAY * 7 + 1;

		await expect(balancer.connect(lzEndpoint).updateInterestRate(interest, newPeriodStart))
			.to.be.revertedWithCustomError(balancer, "NotMultisigOrGov");

		await expect(balancer.updateInterestRate(interest, currentBlockTime))
			.to.be.revertedWithCustomError(sweep, "OldPeriodStart");

		await expect(balancer.updateInterestRate(2e7, newPeriodStart))
			.to.be.revertedWithCustomError(sweep, "OutOfRateRange");

		await expect(sweep.refreshInterestRate(interest, newPeriodStart))
			.to.be.revertedWithCustomError(sweep, "NotBalancer");

		await balancer.updateInterestRate(interest, newPeriodStart);
		expect(await sweep.nextInterestRate()).to.equal(interest);

		newCurrentInterestRate = 5100000;
		newNextInterestRate = 5200000;

		await expect(balancer.connect(lzEndpoint).setInterestRate(newCurrentInterestRate, newNextInterestRate))
			.to.be.revertedWithCustomError(balancer, "NotMultisigOrGov");

		await balancer.setInterestRate(newCurrentInterestRate, newNextInterestRate);
		expect(await sweep.currentInterestRate()).to.equal(newCurrentInterestRate);
		expect(await sweep.nextInterestRate()).to.equal(newNextInterestRate);
	});

	it('sets a new Sweep period start', async () => {
		currentBlockTime = await getBlockTimestamp();

		newCurrentPeriodStart = currentBlockTime;
		newNextPeriodStart = currentBlockTime + Const.DAY * 7;

		await expect(balancer.connect(lzEndpoint).setPeriodStart(newCurrentPeriodStart, newNextPeriodStart))
			.to.be.revertedWithCustomError(balancer, "NotMultisigOrGov");

		await expect(balancer.setPeriodStart(newNextPeriodStart, newCurrentPeriodStart))
			.to.be.revertedWithCustomError(Sweep, "InvalidPeriodStart");

		await balancer.setPeriodStart(newCurrentPeriodStart, newNextPeriodStart);

		expect(await sweep.currentPeriodStart()).to.equal(newCurrentPeriodStart);
		expect(await sweep.nextPeriodStart()).to.equal(newNextPeriodStart);
	});
});

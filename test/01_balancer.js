const { expect } = require("chai");
const { ethers } = require("hardhat");
const { increaseTime, toBN, Const, getBlockTimestamp } = require("../utils/helper_functions");

contract("Balancer", async function () {
	before(async () => {
		[owner, multisig, lzEndpoint, stab_1, stab_2, stab_3, stab_4, stab_5] = await ethers.getSigners();

		ZERO = 0;
		PRECISION = 1e6
		targetPrice = toBN("1", 6);
		loanLimit = toBN("100", 6);
		NEW_loanLimit = toBN("150", 6);

		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepMock");
		SweepProxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
			owner.address,
			50 // 0.005%
		]);
		sweep = await SweepProxy.deployed();

		Balancer = await ethers.getContractFactory("Balancer");
		balancer = await Balancer.deploy(sweep.address, lzEndpoint.address,);

		await sweep.setBalancer(balancer.address);
		stabilizers = [stab_1.address, stab_2.address, stab_3.address, stab_4.address]
		stabilizers.forEach(async (address) => {
			await sweep.addMinter(address, loanLimit);
		});
	});

	it('increases the interest rate because the TWA price is lower', async () => {
		// Set arbspread and twaPrice to increase interest rate
		await sweep.setArbSpread(300);
		await sweep.setTWAPrice(999600);
		
		period = 7; // 7 days
		stepValue = await sweep.stepValue()

		// new interest rate = stepValue(0.005%), because currentInterestRate = 0
		newInterestRate = stepValue;
		nextTargetPrice = await sweep.nextTargetPrice();

		// advance 2 days to start new period
		await increaseTime(Const.DAY * 2);
		// set period to 7 days in balancer
		await balancer.setPeriod(period);

		periodStart = await sweep.periodStart();

		/*------- Start 1st period ------*/
		await balancer.refreshInterestRate();

		expect(await sweep.currentInterestRate()).to.be.equal(Const.ZERO);
		expect(await sweep.nextInterestRate()).to.be.equal(newInterestRate);
		expect(await sweep.currentTargetPrice()).to.be.equal(nextTargetPrice);
		expect(await sweep.currentPeriodStart()).to.be.equal(periodStart);
		expect(await sweep.nextPeriodStart()).to.be.equal(periodStart.add(Const.DAY * 7));

		interestTime = PRECISION * period; // nextPeriodStart - currentPeriodStart = 7 days
        accumulatedRate = PRECISION + (newInterestRate * interestTime) / PRECISION;
		nextTargetPrice = (targetPrice * accumulatedRate) / PRECISION;

		expect(await sweep.nextTargetPrice()).to.be.equal(nextTargetPrice);

		// advance 7 days to start 2nd period
		await increaseTime(Const.DAY * 7);

		interestRate = await sweep.interestRate();
		newInterestRate = interestRate.add(stepValue);
		nextInterestRate = await sweep.nextInterestRate();
		nextTargetPrice = await sweep.nextTargetPrice();
		periodStart = await sweep.periodStart();

		/*------- Start 2nd period ------*/
		await balancer.refreshInterestRate();

		expect(await sweep.currentInterestRate()).to.be.equal(nextInterestRate);
		expect(await sweep.nextInterestRate()).to.be.equal(newInterestRate);
		expect(await sweep.currentTargetPrice()).to.be.equal(nextTargetPrice);
		expect(await sweep.currentPeriodStart()).to.be.equal(periodStart);
		expect(await sweep.nextPeriodStart()).to.be.equal(periodStart.add(Const.DAY * 7));

		// advance 3 day to calculate target price
		await increaseTime(Const.DAY * 3);

		currentTargetPrice = await sweep.currentTargetPrice();
		interestRate = await sweep.interestRate();
		daysInterest = await sweep.daysInterest();

		expect(daysInterest).to.be.equal(4);

		accumulatedRate = PRECISION + interestRate * daysInterest;
		targetPrice = Math.round((currentTargetPrice * accumulatedRate) / PRECISION);

		expect(await sweep.targetPrice()).to.be.equal(targetPrice);
	});

	it('decreases the interest rate because the TWA price is higher', async () => {
		await sweep.setTWAPrice(1100000);

		interestRate = await sweep.interestRate();
		newInterestRate = interestRate - stepValue;

		/*------- Start 3rd period ------*/
		await balancer.refreshInterestRate();

		expect(await sweep.nextInterestRate()).to.be.equal(newInterestRate);
	});

	it('decreases the interest rate because the TWA price is higher', async () => {
		await increaseTime(Const.DAY * 7); // 7 days
		nextTargetPrice = await sweep.nextTargetPrice();
		interestRate = await sweep.interestRate();
		newInterestRate = interestRate - stepValue;

		/*------- Start 4th period ------*/
		await balancer.refreshInterestRate();

		expect(await sweep.nextInterestRate()).to.be.equal(newInterestRate);
		expect(await sweep.targetPrice()).to.be.equal(nextTargetPrice);
		expect(await sweep.currentTargetPrice()).to.be.equal(nextTargetPrice);
		expect(await sweep.nextTargetPrice()).to.be.lessThan(nextTargetPrice);
	});

	it('sets a negative interest rate and decreaces the next target price', async () => {
		await increaseTime(Const.DAY * 7); // 7 days

		interestRate = await sweep.interestRate();
		newInterestRate = interestRate - stepValue; // 0.001%

		next_tp = await sweep.nextTargetPrice();

		/*------- Start 5th period ------*/
		await balancer.refreshInterestRate();

		expect(await sweep.nextInterestRate()).to.be.equal(newInterestRate);
		expect(await sweep.currentTargetPrice()).to.be.equal(next_tp);
		expect(await sweep.nextTargetPrice()).to.lessThan(next_tp);

		await increaseTime(Const.DAY * 7); // 7 days

		expect(await sweep.interestRate()).to.be.equal(newInterestRate);
		currentTargetPrice = await sweep.currentTargetPrice();

		/*------- Start 6th period ------*/
		// revert when newInterest rate is lower than -0.001%
		await expect(balancer.refreshInterestRate())
			.to.be.revertedWithCustomError(Sweep, 'OutOfRateRange');
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
		interest = 500;

		currentBlockTime = await getBlockTimestamp();
		newPeriodStart = currentBlockTime + Const.DAY * 7 + 1;

		await expect(balancer.connect(lzEndpoint).setInterestRate(interest, newPeriodStart))
			.to.be.revertedWithCustomError(balancer, "NotMultisig");

		await balancer.setInterestRate(interest, newPeriodStart);
		expect(await sweep.nextInterestRate()).to.equal(interest);
	});

	it('reverts because expect invest and gets call', async () => {
		await increaseTime(Const.DAY * 7); // 7 days
		await expect(balancer.execute(2, false, 1e6, 2000))
			.to.be.revertedWithCustomError(balancer, "ModeMismatch", 2, 1);
	});
});

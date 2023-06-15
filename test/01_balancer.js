const { expect } = require("chai");
const { ethers } = require("hardhat");
const { increaseTime, toBN, Const, getBlockTimestamp } = require("../utils/helper_functions");

contract("Balancer", async function () {
	before(async () => {
		[owner, multisig, lzEndpoint, stab_1, stab_2, stab_3, stab_4, stab_5] = await ethers.getSigners();

		ZERO = 0;
		targetPrice = toBN("1", 6);
		loanLimit = toBN("100", 6);
		NEW_loanLimit = toBN("150", 6);

		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepMock");
		SweepProxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
			owner.address,
			2500 // 0.25%
		]);
		sweep = await SweepProxy.deployed();

		Balancer = await ethers.getContractFactory("Balancer");
		balancer = await Balancer.deploy(sweep.address);

		await sweep.setBalancer(balancer.address);
		stabilizers = [stab_1.address, stab_2.address, stab_3.address, stab_4.address]
		stabilizers.forEach(async (address) => {
			await sweep.addMinter(address, loanLimit);
		});
	});

	it('begins a new period', async () => {
		expect(await sweep.periodStart()).to.equal(ZERO);

		await balancer.refreshInterestRate();
		timestamp = await getBlockTimestamp();

		expect(await sweep.periodStart()).to.equal(timestamp);
	});

	it('increases the interest rate because the TWA price is lower', async () => {
		await expect(balancer.refreshInterestRate())
			.to.be.revertedWithCustomError(sweep, "NotPassedPeriodTime");

		await sweep.setArbSpread(300);
		await sweep.setTWAPrice(999600);
		await increaseTime(Const.DAY * 7); // 7 days
		await balancer.refreshInterestRate();
		stepValue = await sweep.stepValue();

		expect(await sweep.interestRate()).to.be.equal(stepValue);
		expect(await sweep.targetPrice()).to.be.equal(targetPrice);
		expect(await sweep.currentTargetPrice()).to.be.equal(targetPrice);
		expect(await sweep.nextTargetPrice()).to.be.above(targetPrice);
	});

	it('increases the interest rate because a new period begun', async () => {
		await increaseTime(Const.DAY * 7); // 7 days
		next_tp = await sweep.nextTargetPrice();

		await balancer.refreshInterestRate();

		expect(await sweep.interestRate()).to.be.equal(stepValue * 2);
		expect(await sweep.targetPrice()).to.be.equal(next_tp);
		expect(await sweep.currentTargetPrice()).to.be.equal(next_tp);
		expect(await sweep.nextTargetPrice()).to.be.above(next_tp);
	});

	it('decreases the interest rate because the TWA price is higher', async () => {
		await increaseTime(Const.DAY * 7); // 7 days
		next_tp = await sweep.nextTargetPrice();

		await sweep.setTWAPrice(1000500);
		await balancer.refreshInterestRate();

		expect(await sweep.interestRate()).to.be.equal(stepValue);
		expect(await sweep.targetPrice()).to.be.equal(next_tp);
		expect(await sweep.currentTargetPrice()).to.be.equal(next_tp);
		expect(await sweep.nextTargetPrice()).to.be.above(next_tp);
	});

	it('decreases the interest rate because the TWA price is higher', async () => {
		await increaseTime(Const.DAY * 7); // 7 days
		next_tp = await sweep.nextTargetPrice();

		await balancer.refreshInterestRate();

		expect(await sweep.interestRate()).to.be.equal(ZERO);
		expect(await sweep.targetPrice()).to.be.equal(next_tp);
		expect(await sweep.currentTargetPrice()).to.be.equal(next_tp);
		expect(await sweep.nextTargetPrice()).to.be.equal(next_tp);
	});

	it('sets a negative interest rate and decreaces the next target price', async () => {
		await increaseTime(Const.DAY * 7); // 7 days
		next_tp = await sweep.nextTargetPrice();

		await balancer.refreshInterestRate();

		expect(await sweep.interestRate()).to.be.equal(-stepValue);
		expect(await sweep.targetPrice()).to.be.equal(next_tp);
		expect(await sweep.currentTargetPrice()).to.be.equal(next_tp);
		expect(await sweep.nextTargetPrice()).to.not.above(next_tp);
	});

	it('reverts refresh interest rate when caller is not sweep owner', async () => {
		await expect(balancer.connect(multisig).refreshInterestRate())
			.to.be.revertedWithCustomError(sweep, 'NotMultisig');
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
		interest = 2500;
		await expect(balancer.connect(lzEndpoint).setInterestRate(interest))
			.to.be.revertedWithCustomError(balancer, "NotMultisig");

		await balancer.setInterestRate(interest);
		expect(await sweep.interestRate()).to.equal(interest);
	});

	it('refresh the interest rate calling execute', async () => {
		interest = await sweep.interestRate();
		nextTarget = await sweep.nextTargetPrice();

		await increaseTime(Const.DAY * 7); // 7 days
		await balancer.execute(0, false, 1e6, 2000);

		expect(await sweep.interestRate()).to.eq(Const.ZERO);
		expect(await sweep.targetPrice()).to.eq(nextTarget);
		expect(await sweep.currentTargetPrice()).to.eq(nextTarget);
		expect(await sweep.nextTargetPrice()).to.eq(nextTarget);
	});

	it('reverts because expect invest and gets call', async () => {
		await increaseTime(Const.DAY * 7); // 7 days
		await expect(balancer.execute(2, false, 1e6, 2000))
			.to.be.revertedWithCustomError(balancer, "ModeMismatch", 2, 1);
	});
});

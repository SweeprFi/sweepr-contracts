const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { increaseTime, toBN, Const } = require("../utils/helper_functions");

contract("Balancer", async function () {
	before(async () => {
		[owner, multisig, lzEndpoint, stab_1, stab_2, stab_3, stab_4, stab_5] = await ethers.getSigners();

		ZERO = 0;
		TARGET_PRICE = toBN("1", 6);
		LOAN_LIMIT = toBN("100", 6);
		NEW_LOAN_LIMIT = toBN("150", 6);

		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepMock");
		SweepProxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
		sweep = await SweepProxy.deployed();

		Balancer = await ethers.getContractFactory("Balancer");
		balancer = await Balancer.deploy(sweep.address, addresses.usdc, owner.address);

		await sweep.setBalancer(balancer.address);
		stabilizers = [stab_1.address, stab_2.address, stab_3.address, stab_4.address]
		stabilizers.forEach(async (address) => {
			await sweep.addMinter(address, LOAN_LIMIT);
		});
	});

	it('begins a new period', async () => {
		expect(await sweep.period_start()).to.equal(ZERO);

		await balancer.refreshInterestRate();
		blockNumber = await ethers.provider.getBlockNumber();
		block = await ethers.provider.getBlock(blockNumber);

		expect(await sweep.period_start()).to.equal(block.timestamp);
	});

	it('increases the interest rate because the TWA price is lower', async () => {
		await expect(balancer.refreshInterestRate())
			.to.be.revertedWithCustomError(sweep, "NotPassedPeriodTime");

		await sweep.setArbSpread(300);
		await sweep.setTWAPrice(999600);
		await increaseTime(Const.DAY * 7); // 7 days
		await balancer.refreshInterestRate();
		stepValue = await sweep.step_value();

		expect(await sweep.interest_rate()).to.be.equal(stepValue);
		expect(await sweep.target_price()).to.be.equal(TARGET_PRICE);
		expect(await sweep.current_target_price()).to.be.equal(TARGET_PRICE);
		expect(await sweep.next_target_price()).to.be.above(TARGET_PRICE);
	});

	it('increases the interest rate because a new period begun', async () => {
		await increaseTime(Const.DAY * 7); // 7 days
		next_tp = await sweep.next_target_price();

		await balancer.refreshInterestRate();

		expect(await sweep.interest_rate()).to.be.equal(stepValue*2);
		expect(await sweep.target_price()).to.be.equal(next_tp);
		expect(await sweep.current_target_price()).to.be.equal(next_tp);
		expect(await sweep.next_target_price()).to.be.above(next_tp);
	});

	it('decreases the interest rate because the TWA price is higher', async () => {
		await increaseTime(Const.DAY * 7); // 7 days
		next_tp = await sweep.next_target_price();

		await sweep.setTWAPrice(1000500);
		await balancer.refreshInterestRate();

		expect(await sweep.interest_rate()).to.be.equal(stepValue);
		expect(await sweep.target_price()).to.be.equal(next_tp);
		expect(await sweep.current_target_price()).to.be.equal(next_tp);
		expect(await sweep.next_target_price()).to.be.above(next_tp);
	});

	it('decreases the interest rate because the TWA price is higher', async () => {
		await increaseTime(Const.DAY * 7); // 7 days
		next_tp = await sweep.next_target_price();

		await balancer.refreshInterestRate();

		expect(await sweep.interest_rate()).to.be.equal(ZERO);
		expect(await sweep.target_price()).to.be.equal(next_tp);
		expect(await sweep.current_target_price()).to.be.equal(next_tp);
		expect(await sweep.next_target_price()).to.be.equal(next_tp);
	});

	it('sets a negative interest rate and decreaces the next target price', async () => {
		await increaseTime(Const.DAY * 7); // 7 days
		next_tp = await sweep.next_target_price();

		await balancer.refreshInterestRate();

		expect(await sweep.interest_rate()).to.be.equal(-stepValue);
		expect(await sweep.target_price()).to.be.equal(next_tp);
		expect(await sweep.current_target_price()).to.be.equal(next_tp);
		expect(await sweep.next_target_price()).to.not.above(next_tp);
	});

	it('reverts refresh interest rate when caller is not sweep owner', async () => {
		await expect(balancer.connect(multisig).refreshInterestRate())
			.to.be.revertedWithCustomError(balancer, 'OnlyAdmin');
	});

	it('adds stabilizers to the limits map', async () => {
		amounts = [LOAN_LIMIT, LOAN_LIMIT, LOAN_LIMIT, LOAN_LIMIT];
		autoInvest = [true, true, true, true];

		stabilizers.forEach(async (address) => {
			info = await balancer.limits(address);

			expect(info.added).to.be.equal(false);
			expect(info.amount).to.be.equal(0);
			expect(info.auto_invest).to.be.equal(false);
		});

		await expect(balancer.addLoanLimits(stabilizers, amounts, []))
			.to.be.revertedWith("Wrong data received");

		await expect(balancer.addLoanLimits(stabilizers, [], autoInvest))
			.to.be.revertedWith("Wrong data received");

		await balancer.addLoanLimits(stabilizers, amounts, autoInvest);

		stabilizers.forEach(async (address) => {
			info = await balancer.limits(address);

			expect(info.added).to.be.equal(true);
			expect(info.amount).to.be.equal(LOAN_LIMIT);
			expect(info.auto_invest).to.be.equal(true);
		});

		await expect(balancer.addLoanLimit(stab_5.address, LOAN_LIMIT, true))
			.to.be.revertedWithCustomError(balancer, "InvalidMinter");

		await balancer.addLoanLimit(stab_4.address, NEW_LOAN_LIMIT, true);
		info = await balancer.limits(stab_4.address);
		expect(info.added).to.be.equal(true);
		expect(info.amount).to.be.equal(NEW_LOAN_LIMIT);
		expect(info.auto_invest).to.be.equal(true);
	});

	it('removes stabilizers form the limits map', async () => {
		await balancer.removeLoanLimit(stab_4.address);
		info = await balancer.limits(stab_4.address);
		expect(info.added).to.be.equal(false);
		expect(info.amount).to.be.equal(0);
		expect(info.auto_invest).to.be.equal(false);

		await balancer.removeLoanLimits();

		stabilizers.forEach(async (address) => {
			info = await balancer.limits(address);

			expect(info.added).to.be.equal(false);
			expect(info.amount).to.be.equal(0);
			expect(info.auto_invest).to.be.equal(false);
		});
	});
});

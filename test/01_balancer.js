const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { increaseTime } = require("../utils/helper_functions");

contract("Balancer - Local", async function () {
	before(async () => {
		[owner, multisig, treasury, usdc, uniswap_amm, lzEndpoint] = await ethers.getSigners();
		ZERO = 0;
		TARGET_PRICE = ethers.utils.parseUnits("1", 6);

		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepMock");
		SweepProxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
		sweep = await SweepProxy.deployed();

		Balancer = await ethers.getContractFactory("Balancer");
		balancer = await Balancer.deploy(sweep.address, addresses.usdc);

		await sweep.connect(owner).setBalancer(balancer.address);
	});

	it('increases the target price through time', async () => {
		expect(await sweep.period_start()).to.equal(ZERO);
		expect(await sweep.interest_rate()).to.equal(ZERO);
		expect(await sweep.target_price()).to.equal(TARGET_PRICE);

		// begin 1st period
		await balancer.connect(owner).refreshInterestRate();

		blockNumber = await ethers.provider.getBlockNumber();
		block = await ethers.provider.getBlock(blockNumber);
		stepValue = await sweep.step_value();

		expect(await sweep.period_start()).to.equal(block.timestamp);
		expect(await sweep.interest_rate()).to.equal(stepValue);

		await increaseTime(604800); // 7 days
		priceAfter7Days = await sweep.target_price();
		expect(priceAfter7Days).to.above(TARGET_PRICE);

		// begin 2nd period
		await balancer.connect(owner).refreshInterestRate();

		await increaseTime(604800); // 7days ~ 14 days
		priceAfter14Days = await sweep.target_price();
		expect(priceAfter14Days).to.above(priceAfter7Days);

		// begin 3nd period
		await balancer.connect(owner).refreshInterestRate();

		await increaseTime(432000); // 5 days ~ 21 days
		priceAfter21Days = await sweep.target_price();
		expect(priceAfter21Days).to.equal(priceAfter14Days);
	});

	it('should be reverted because is called before 7 days.', async () => {
		await expect(
			balancer.connect(owner).refreshInterestRate()
		).to.be.revertedWithCustomError(sweep, 'NotPassedPeriodTime');

		await increaseTime(432000); // 5 days ~ 26 days
		// Set negative interest rate
		await sweep.connect(owner).setInterestRate(-3e4); // -3%

		// begin 4th period
		await balancer.connect(owner).refreshInterestRate();
		await increaseTime(604800); // 7 days ~ 33 days

		currentTargetPrice = await sweep.target_price();
		expect(currentTargetPrice).to.not.above(priceAfter21Days);
	});

	it('reverts refresh interest rate when caller is not sweep owner', async () => {
		await expect(balancer.connect(multisig).refreshInterestRate())
			.to.be.revertedWithCustomError(balancer, 'OnlyAdmin');
	});
});

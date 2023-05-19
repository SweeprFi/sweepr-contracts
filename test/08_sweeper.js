const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');

contract("Sweeper", async function () {
	before(async () => {
		[owner, newAddress, newMinter, lzEndpoint, mintBurn, multisig] = await ethers.getSigners();
		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepMock");
		Sweeper = await ethers.getContractFactory("SWEEPER");
		Treasury = await ethers.getContractFactory("Treasury");

		TRANSFER_AMOUNT = ethers.utils.parseUnits("1000", 18);
		PRECISION = 1000000;
		ZERO = 0;

		const Proxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
			multisig.address,
			addresses.approver,
			2500 // 0.25%
		]);
		old_sweep = await Proxy.deployed();
		sweep = await Proxy.deployed();

		treasury = await Treasury.deploy(sweep.address);
		sweeper = await Sweeper.deploy(old_sweep.address, treasury.address);
	});

	it('sets new config correctly', async () => {
		expect(await sweeper.SWEEP()).to.be.equal(old_sweep.address);
		await expect(sweeper.setSWEEP(ethers.constants.AddressZero))
			.to.be.revertedWithCustomError(sweeper, "ZeroAddressDetected");
		await sweeper.setSWEEP(sweep.address);
		expect(await sweeper.SWEEP()).to.be.equal(sweep.address);

		expect(await sweeper.mintBurnAddress()).to.be.equal(owner.address);

		await sweeper.setMintBurnAddress(mintBurn.address);
		expect(await sweeper.mintBurnAddress()).to.be.equal(mintBurn.address);
		await sweeper.setMintBurnAddress(owner.address);

		expect(await sweeper.allowMinting()).to.be.equal(false);
		await sweeper.setAllowMinting(true);
		expect(await sweeper.allowMinting()).to.be.equal(true);

		expect(await sweeper.allowBurning()).to.be.equal(false);
		await sweeper.setAllowBurning(true);
		expect(await sweeper.allowBurning()).to.be.equal(true);
	});

	it('reverts buy Sweeper when treasury percent is greater than target treasury', async () => {
		// set target treasury to 9%
		await sweeper.setTargetTreasury(90000);

		treasurySweep = await sweeper.balanceOf(treasury.address);
		sweepTotal = await sweep.totalSupply();
		targetPrice = await sweep.target_price();
		sweeperPrice = await sweeper.price();
		treasuryPercent = ((treasurySweep + TRANSFER_AMOUNT) * PRECISION) / sweepTotal;
		expect(await sweeper.targetTreasury()).to.lessThanOrEqual(treasuryPercent);

		await expect(sweeper.connect(owner).buySWEEPER(TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(Sweeper, 'GreaterThanTargetTreasury');
	});

	it('reverts buy Sweeper when caller is not sweep owner in batch sell', async () => {
		await expect(sweeper.connect(newAddress).buySWEEPER(TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(Sweeper, 'ExchangesNotPermitted');
	});

	it('can not buys Sweeper when contract has been paused', async () => {
		// set target treasury to 10%
		await sweeper.setTargetTreasury(100000);
		await sweeper.pause();

		await sweep.connect(owner).approve(sweeper.address, TRANSFER_AMOUNT);
		await expect(sweeper.connect(owner).buySWEEPER(TRANSFER_AMOUNT))
			.to.be.revertedWith("Pausable: paused");
	});

	it('buys Sweeper', async () => {
		await sweeper.unpause();
		expect(await sweeper.balanceOf(owner.address)).to.equal(ZERO);

		treasurySweep = await sweep.balanceOf(treasury.address);
		sweepTotal = await sweep.totalSupply();
		targetPrice = await sweep.target_price();
		sweeperPrice = await sweeper.price();
		treasuryPercent = ((treasurySweep + TRANSFER_AMOUNT) * PRECISION) / sweepTotal;

		await sweep.connect(owner).approve(sweeper.address, TRANSFER_AMOUNT);
		await sweeper.connect(owner).buySWEEPER(TRANSFER_AMOUNT);

		sweeperAmount = (TRANSFER_AMOUNT * sweeperPrice) / (targetPrice * 1e18);
		ownerSweeperBalance = (await sweeper.balanceOf(owner.address)) / 1e18;

		expect(await sweep.balanceOf(treasury.address)).to.equal(TRANSFER_AMOUNT);
		expect(ownerSweeperBalance).to.equal(sweeperAmount);
	});

	it('reverts sell Sweeper when treasury percent is smaller than target treasury', async () => {
		TRANSFER_AMOUNT = ethers.utils.parseUnits("500", 18); // 500 SWEEPER

		// set target treasury to 10%
		await sweeper.setTargetTreasury(100000);

		treasurySweep = await sweep.balanceOf(treasury.address);
		sweepTotal = await sweep.totalSupply();
		targetPrice = await sweep.target_price();
		sweeperPrice = await sweeper.price();

		treasuryPercent = ((treasurySweep - TRANSFER_AMOUNT) * PRECISION) / sweepTotal;

		expect(await sweeper.targetTreasury()).to.greaterThanOrEqual(treasuryPercent);

		await expect(sweeper.connect(owner).sellSWEEPER(TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(Sweeper, 'SmallerThanTargetTreasury');
	});

	it('reverts sell Sweeper when sweeper address is not set in treasury', async () => {
		// set target treasury to 1%
		await sweeper.setTargetTreasury(10000);
		// 500 SWEEPER
		TRANSFER_AMOUNT = ethers.utils.parseUnits("500", 18);

		await expect(sweeper.connect(owner).sellSWEEPER(TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(Treasury, 'NotSWEEPER');
	});

	it('reverts sell Sweeper when caller is not sweep owner in batch sell', async () => {
		await expect(sweeper.connect(newAddress).sellSWEEPER(TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(Sweeper, 'ExchangesNotPermitted');
	});

	it('sells Sweeper', async () => {
		TRANSFER_AMOUNT = ethers.utils.parseUnits("500", 18); // 500 SWEEPER

		// set target treasury to 1%
		await sweeper.setTargetTreasury(10000);

		// set sweewper address in treasury
		await treasury.connect(owner).setSWEEPER(sweeper.address);

		treasurySweepBeforeBalance = await sweep.balanceOf(treasury.address) / 1e18;
		ownerSweepBeforeBalance = await sweep.balanceOf(owner.address) / 1e18;
		ownerSweeperBeforeBalance = await sweeper.balanceOf(owner.address) / 1e18;

		await sweeper.connect(owner).sellSWEEPER(TRANSFER_AMOUNT);

		sweepAmount = (TRANSFER_AMOUNT * targetPrice) / (sweeperPrice * 1e18);
		ownerSweepAfterBalance = Math.round(((await sweep.balanceOf(owner.address)) / 1e18));
		treasurySweepAfterBalance = Math.round(((await sweep.balanceOf(treasury.address)) / 1e18));
		ownerSweeperAfterBalance = Math.round(((await sweeper.balanceOf(owner.address)) / 1e18));

		expect(ownerSweepAfterBalance).to.equal(ownerSweepBeforeBalance + sweepAmount);
		expect(treasurySweepAfterBalance).to.equal(treasurySweepBeforeBalance - sweepAmount);
		expect(ownerSweeperAfterBalance).to.equal(ownerSweeperBeforeBalance - TRANSFER_AMOUNT / 1e18);
	});
});

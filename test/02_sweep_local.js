const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { toBN, Const } = require("../utils/helper_functions");

contract("Sweep - settings", async function () {
	before(async () => {
		[owner, multisig, receiver, treasury, newAddress, newMinter, lzEndpoint] = await ethers.getSigners();

		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepCoin");

		TRANSFER_AMOUNT = toBN("100", 18);
		interestRate = 5e4; // 5%

		const Proxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
			addresses.owner,
			2500 // 0.25%
		]);
		sweep = await Proxy.deployed(Sweep);

		VestingApprover = await ethers.getContractFactory("VestingApprover");
		vestingApprover = await VestingApprover.deploy(sweep.address);
	});

	it('set admin to multisig', async () => {
		// Transfer ownership to multisig
		await sweep.connect(owner).transferOwnership(multisig.address);
		expect(await sweep.owner()).to.equal(multisig.address);
	});

	it('gets the target price correctly', async () => {
		targetPrice = await sweep.targetPrice();
		expect(await sweep.currentTargetPrice()).to.equal(targetPrice);
	});

	it('sets a new fast multisig correctly', async () => {
		expect(await sweep.fastMultisig()).to.eq(addresses.owner);
		await sweep.connect(multisig).setFastMultisig(multisig.address);
		expect(await sweep.fastMultisig()).to.eq(multisig.address);
	});

	it('sets a new treasury correctly', async () => {
		expect(await sweep.treasury()).to.eq(Const.ADDRESS_ZERO);

		await expect(sweep.connect(multisig).setTreasury(Const.ADDRESS_ZERO))
			.to.be.revertedWithCustomError(sweep, "ZeroAddressDetected");

		await sweep.connect(multisig).setTreasury(treasury.address);
		expect(await sweep.treasury()).to.eq(treasury.address);

		await expect(sweep.connect(multisig).setTreasury(treasury.address))
			.to.be.revertedWithCustomError(sweep, "AlreadyExist");
	});

	it('sets a new arb spread correctly', async () => {
		expect(await sweep.arbSpread()).to.eq(1000);
		await sweep.connect(multisig).setArbSpread(2000);
		expect(await sweep.arbSpread()).to.eq(2000);
	});

	it('sets a new balancer address correctly', async () => {
		expect(await sweep.balancer()).to.equal(Const.ADDRESS_ZERO);
		await expect(sweep.connect(multisig).setBalancer(Const.ADDRESS_ZERO))
			.to.be.revertedWithCustomError(sweep, "ZeroAddressDetected");
		await sweep.connect(multisig).setBalancer(newAddress.address);
		expect(await sweep.balancer()).to.equal(newAddress.address);
	});

	it('sets a new current target price correctly', async () => {
		newTargetPrice = 1010000;
		expect(await sweep.currentTargetPrice()).to.equal(await sweep.nextTargetPrice());
		await sweep.connect(newAddress).setTargetPrice(newTargetPrice);
		expect(await sweep.currentTargetPrice()).to.equal(newTargetPrice);
	});

	it('upgrades Sweep', async () => {
		await sweep.connect(multisig).setArbSpread(1000);
		const arbSpreadBefore = await sweep.arbSpread();

		// Sweep Upgrade
		Sweep2 = await ethers.getContractFactory("SweepCoin");
		upgraded = await upgrades.upgradeProxy(sweep.address, Sweep2);

		const arbSpreadAfter = await sweep.arbSpread();

		// Check to see if upgraded Sweep contract keeps interest rate of previous contract
		expect(arbSpreadBefore.toNumber()).to.equal(arbSpreadAfter.toNumber());
	});

	it('sets a new minter and gets his information correctly', async () => {
		expect(await sweep.isValidMinter(newMinter.address)).to.equal(Const.FALSE);

		await sweep.connect(multisig).addMinter(newMinter.address, TRANSFER_AMOUNT);
		expect(await sweep.isValidMinter(newMinter.address)).to.equal(Const.TRUE);
		minterInfo = await sweep.minters(newMinter.address);

		expect(minterInfo.maxAmount).to.equal(TRANSFER_AMOUNT);
		expect(minterInfo.mintedAmount).to.equal(Const.ZERO);
		expect(minterInfo.isListed).to.equal(Const.TRUE);
		expect(minterInfo.isEnabled).to.equal(Const.TRUE);
	});

	it('mints SWEEP for a valid minter', async () => {
		await expect(sweep.connect(treasury).mint(10))
			.to.be.revertedWithCustomError(Sweep, 'InvalidMinter');

		await sweep.connect(newMinter).mint(10)
		minterInfo = await sweep.minters(newMinter.address);

		expect(minterInfo.maxAmount).to.equal(TRANSFER_AMOUNT);
		expect(minterInfo.mintedAmount).to.equal(10);
		expect(minterInfo.isListed).to.equal(Const.TRUE);
		expect(minterInfo.isEnabled).to.equal(Const.TRUE);
	});

	it('burns SWEEP for a valid minter', async () => {
		await expect(sweep.connect(treasury).burn(10))
			.to.be.revertedWithCustomError(Sweep, 'InvalidMinter');

		await sweep.connect(newMinter).burn(10)
		minterInfo = await sweep.minters(newMinter.address);

		expect(minterInfo.maxAmount).to.equal(TRANSFER_AMOUNT);
		expect(minterInfo.mintedAmount).to.equal(Const.ZERO);
		expect(minterInfo.isListed).to.equal(Const.TRUE);
		expect(minterInfo.isEnabled).to.equal(Const.TRUE);
	});

	it('sets a new config for a minter correctly', async () => {
		await sweep.connect(multisig).setMinterMaxAmount(newMinter.address, TRANSFER_AMOUNT.mul(2));
		minterInfo = await sweep.minters(newMinter.address);

		expect(minterInfo.maxAmount).to.equal(TRANSFER_AMOUNT.mul(2));
		expect(minterInfo.mintedAmount).to.equal(Const.ZERO);
		expect(minterInfo.isListed).to.equal(Const.TRUE);
		expect(minterInfo.isEnabled).to.equal(Const.TRUE);

		await sweep.connect(newMinter).mint(TRANSFER_AMOUNT);
		await sweep.connect(multisig).setMinterEnabled(newMinter.address, Const.FALSE);
		minterInfo = await sweep.minters(newMinter.address);

		await expect(sweep.connect(newMinter).mint(10))
			.to.be.revertedWithCustomError(Sweep, 'MintDisabled');

		expect(minterInfo.maxAmount).to.equal(TRANSFER_AMOUNT.mul(2));
		expect(minterInfo.mintedAmount).to.equal(TRANSFER_AMOUNT);
		expect(minterInfo.isListed).to.equal(Const.TRUE);
		expect(minterInfo.isEnabled).to.equal(Const.FALSE);
	});

	it('removes from minters list', async () => {
		await sweep.connect(multisig).removeMinter(newMinter.address);
		expect(await sweep.isValidMinter(newMinter.address)).to.equal(Const.FALSE);
	});

	it('Converts Sweep amount to USDC amount', async () => {
		amount = toBN("100", 18);
		usdAmount = await sweep.convertToUSD(amount);
		sweepAmount = await sweep.convertToSWEEP(usdAmount);
		expect(sweepAmount).to.eq(amount);
	})

	it('sets a new AMM and gets price correctly', async () => {
		expect(await sweep.amm()).to.equal(Const.ADDRESS_ZERO);

		// TODO: change to _amm after new deployment
		amm = addresses.uniswap_oracle;

		await expect(sweep.connect(multisig).setAMM(Const.ADDRESS_ZERO))
			.to.be.revertedWithCustomError(sweep, "ZeroAddressDetected")
		await sweep.connect(multisig).setAMM(amm);

		expect(await sweep.amm()).to.equal(amm);

		price = await sweep.ammPrice();
		expect(price).to.above(Const.ZERO);
	});

	it('sets a new transfer approver correctly', async () => {
		await expect(sweep.connect(treasury).setTransferApprover(Const.ADDRESS_ZERO))
			.to.be.revertedWithCustomError(sweep, "NotGovernance");

		await expect(sweep.connect(multisig).setTransferApprover(Const.ADDRESS_ZERO))
			.to.be.revertedWithCustomError(sweep, "ZeroAddressDetected");

		await sweep.connect(multisig).setTransferApprover(vestingApprover.address)
	});
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { Const } = require("../utils/helper_functions");

contract("Sweepr", async function () {
	before(async () => {
		[owner, sender, receiver, lzEndpoint] = await ethers.getSigners();
		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepCoin");
		Sweepr = await ethers.getContractFactory("SweeprCoin");

		MINT_AMOUNT = ethers.utils.parseUnits("2000", 18);
		TRANSFER_AMOUNT = ethers.utils.parseUnits("1000", 18);
		PRECISION = 1000000;
		ZERO = 0;

		const Proxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
			addresses.owner,
			2500 // 0.25%
		]);
		sweep = await Proxy.deployed();

		BlacklistApprover = await ethers.getContractFactory("TransferApproverBlacklist");
		blacklistApprover = await BlacklistApprover.deploy();

		sweepr = await Sweepr.deploy(sweep.address);
	});

	it('sets a new transfer approver correctly', async () => {
		await expect(sweepr.setTransferApprover(Const.ADDRESS_ZERO))
			.to.be.revertedWithCustomError(sweepr, "ZeroAddressDetected");
		await sweepr.setTransferApprover(blacklistApprover.address);
	});

	it('reverts mint when caller is not owner', async () => {
		await expect(sweepr.connect(sender).mint(sender.address, TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'NotGovernance');
	});

	it('mints and burns correctly by owner', async () => {
		senderBalance = await sweepr.balanceOf(sender.address);
		expect(senderBalance).to.equal(ZERO);

		await sweepr.connect(owner).mint(sender.address, MINT_AMOUNT);

		senderBalance = await sweepr.balanceOf(sender.address);
		expect(senderBalance).to.equal(MINT_AMOUNT);

		await sweepr.connect(sender).burn(TRANSFER_AMOUNT);

		senderBalance = await sweepr.balanceOf(sender.address);
		expect(senderBalance).to.equal(TRANSFER_AMOUNT);
	});

	it('reverts transfer when receiver is blacklisted', async () => {
		expect(await blacklistApprover.isBlacklisted(receiver.address)).to.equal(false);

		// Add receiver into blocklist
		await blacklistApprover.connect(owner).blacklist(receiver.address);
		expect(await blacklistApprover.isBlacklisted(receiver.address)).to.equal(true);

		await expect(sweepr.connect(sender).transfer(receiver.address, TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'TransferNotAllowed');
	});

	it('transfers successfully when receiver is unblacklisted', async () => {
		// Remove receiver from blocklist
		await blacklistApprover.connect(owner).unBlacklist(receiver.address);
		expect(await blacklistApprover.isBlacklisted(receiver.address)).to.equal(false);

		receiverBalance = await sweepr.balanceOf(receiver.address);
		expect(receiverBalance).to.equal(ZERO);

		await sweepr.connect(sender).transfer(receiver.address, TRANSFER_AMOUNT)

		receiverBalance = await sweepr.balanceOf(receiver.address);
		expect(receiverBalance).to.equal(TRANSFER_AMOUNT);
	});
});

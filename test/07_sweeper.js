const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');

contract("Sweeper", async function () {
	before(async () => {
		[owner, sender, receiver, lzEndpoint] = await ethers.getSigners();
		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepDollarCoin");
		Sweeper = await ethers.getContractFactory("SWEEPER");

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
		blacklistApprover = await BlacklistApprover.deploy(sweep.address);

		sweeper = await Sweeper.deploy(sweep.address);
		await sweeper.setTransferApprover(blacklistApprover.address);
	});

	it('reverts mint when caller is not owner', async () => {
		await expect(sweeper.connect(sender).mint(sender.address, TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(Sweeper, 'NotGovernance');
	});

	it('mints correctly by owner', async () => {
		senderBalance = await sweeper.balanceOf(sender.address);
		expect(senderBalance).to.equal(ZERO);

		await sweeper.connect(owner).mint(sender.address, TRANSFER_AMOUNT);

		senderBalance = await sweeper.balanceOf(sender.address);
		expect(senderBalance).to.equal(TRANSFER_AMOUNT);
	});

	it('reverts transfer when receiver is blacklisted', async () => {
		expect(await blacklistApprover.isBlacklisted(receiver.address)).to.equal(false);

		// Add receiver into blocklist
		await blacklistApprover.connect(owner).blacklist(receiver.address);
		expect(await blacklistApprover.isBlacklisted(receiver.address)).to.equal(true);

		await expect(sweeper.connect(sender).transfer(receiver.address, TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(Sweeper, 'TransferNotAllowed');
	});

	it('transfers successfully when receiver is unblacklisted', async () => {
		// Remove receiver from blocklist
		await blacklistApprover.connect(owner).unBlacklist(receiver.address);
		expect(await blacklistApprover.isBlacklisted(receiver.address)).to.equal(false);

		receiverBalance = await sweeper.balanceOf(receiver.address);
		expect(receiverBalance).to.equal(ZERO);

		await sweeper.connect(sender).transfer(receiver.address, TRANSFER_AMOUNT)

		receiverBalance = await sweeper.balanceOf(receiver.address);
		expect(receiverBalance).to.equal(TRANSFER_AMOUNT);
	});
});

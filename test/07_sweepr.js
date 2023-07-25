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
		MAX_MINT_AMOUNT = ethers.utils.parseUnits("10000000", 18);
		TRANSFER_AMOUNT = ethers.utils.parseUnits("1000", 18);
		PRECISION = 1000000;
		ZERO = 0;

		const Proxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
			addresses.owner,
			2500 // 0.25%
		]);
		sweep = await Proxy.deployed();
		sweepr = await Sweepr.deploy(Const.TRUE, lzEndpoint.address); // TRUE means governance chain
	});

	it('reverts mint when caller is not owner', async () => {
		await expect(sweepr.connect(sender).mint(sender.address, TRANSFER_AMOUNT))
			.to.be.revertedWith('Ownable: caller is not the owner');
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

	it('revert when total supply + mint amount > max_mint_amount', async () => {
		await expect(sweepr.connect(owner).mint(sender.address, MAX_MINT_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'OverMaxSupply');
	});

	it('set governance chain correctly', async () => {
		await expect(sweepr.connect(sender).setGovernanceChain(Const.FALSE))
			.to.be.revertedWith('Ownable: caller is not the owner');

		await sweepr.connect(owner).setGovernanceChain(Const.FALSE)

		expect(await sweepr.isGovernanceChain()).to.equal(Const.FALSE);

		await expect(sweepr.connect(owner).mint(sender.address, MINT_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'NotGovernanceChain');
	});
});

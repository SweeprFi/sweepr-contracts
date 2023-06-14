const { expect } = require("chai");
const { ethers } = require("hardhat");

contract("TokenDistributor", async function () {
	before(async () => {
		[owner, sender, lzEndpoint] = await ethers.getSigners();
		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepMock");
		Sweepr = await ethers.getContractFactory("SweeprCoin");
		Treasury = await ethers.getContractFactory("Treasury");
		TokenDistributor = await ethers.getContractFactory("TokenDistributor");
		BlacklistApprover = await ethers.getContractFactory("TransferApproverBlacklist");

		SWEEP_MINT_AMOUNT = ethers.utils.parseUnits("100000", 18);
		SWEEPR_MINT_AMOUNT = ethers.utils.parseUnits("10000", 18);
		PRECISION = 1000000;
		ZERO = 0;

		const Proxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
			owner.address,
			2500 // 0.25%
		]);
		sweep = await Proxy.deployed();

		sweepr = await Sweepr.deploy(sweep.address, lzEndpoint.address);
		tokenDistributor = await TokenDistributor.deploy(sweep.address, sweepr.address);
		treasury = await Treasury.deploy(sweep.address);

		await sweep.setTreasury(treasury.address);

		// mint sweep for sender
		await sweep.connect(owner).addMinter(sender.address, SWEEP_MINT_AMOUNT);
		await sweep.connect(sender).minterMint(sender.address, SWEEP_MINT_AMOUNT);

		// mint sweepr for TokenDstributor contract
		await sweepr.connect(owner).mint(tokenDistributor.address, SWEEPR_MINT_AMOUNT);
		await sweepr.connect(owner).setPrice(1100000); // 1.1 SWEEP
	});

	it('buys sweepr', async () => {
		expect(await sweepr.balanceOf(sender.address)).to.equal(ZERO);

		sweepAmount = ethers.utils.parseUnits("7000", 18);
		sweeprPrice = await sweepr.price();

		await sweep.connect(sender).approve(tokenDistributor.address, sweepAmount);
		await tokenDistributor.connect(sender).buy(sweepAmount);

		sweeprAmount = Math.round(((sweepAmount * sweeprPrice) / PRECISION) / 1e18);
		senderSweeprBalance = (await sweepr.balanceOf(sender.address)) / 1e18;

		expect(await sweep.balanceOf(tokenDistributor.address)).to.equal(sweepAmount);
		expect(senderSweeprBalance).to.equal(sweeprAmount);
	});

	it('reverts buying sweepr when sweepr balancer of contract is not enough', async () => {
		sweepAmount = ethers.utils.parseUnits("7000", 18);
		sweeprPrice = await sweepr.price();

		sweeprAmount = Math.round(((sweepAmount * sweeprPrice) / PRECISION) / 1e18);
		distributorSweeprBalance = (await sweepr.balanceOf(tokenDistributor.address)) / 1e18;

		expect(distributorSweeprBalance).to.lessThan(sweeprAmount);

		await sweep.connect(sender).approve(tokenDistributor.address, sweepAmount);

		await expect(tokenDistributor.connect(sender).buy(sweepAmount))
			.to.be.revertedWithCustomError(TokenDistributor, 'NotEnoughBalance');
	});

	it('sells sweeper', async () => {
		sellAmount = ethers.utils.parseUnits("1000", 18); // 1000 SWEEPR
		sweepAmount = ethers.utils.parseUnits("10000", 18); // 10000 SWEEP

		senderSweepBeforeBalance = await sweep.balanceOf(sender.address) / 1e18;
		distributorSweeprBeforeBalance = await sweepr.balanceOf(tokenDistributor.address) / 1e18;

		await sweepr.connect(sender).approve(tokenDistributor.address, sellAmount);
		await expect(tokenDistributor.connect(sender).sell(sweepAmount))
			.to.be.revertedWithCustomError(tokenDistributor, "NotEnoughBalance");
		await tokenDistributor.connect(sender).sell(sellAmount);

		sweepAmount = Math.round(((sellAmount * PRECISION) / sweeprPrice) / 1e18);

		senderSweepAfterBalance = Math.round(((await sweep.balanceOf(sender.address)) / 1e18));
		distributorSweeprAfterBalance = Math.round(((await sweepr.balanceOf(tokenDistributor.address)) / 1e18));

		expect(senderSweepAfterBalance).to.equal(senderSweepBeforeBalance + sweepAmount);
		expect(distributorSweeprAfterBalance).to.equal(distributorSweeprBeforeBalance + (sellAmount / 1e18));
	});

	it('reverts calling recover() function when caller is not owner', async () => {
		sweeprAmount = await sweepr.balanceOf(tokenDistributor.address);

		await expect(tokenDistributor.connect(sender).recover(sweepr.address, sweeprAmount))
			.to.be.revertedWithCustomError(Sweepr, 'NotGovernance');
	});

	it('sends all sweepr amount to treasury', async () => {
		sweeprAmount = await sweepr.balanceOf(tokenDistributor.address);

		treasurySweeprBeforeBalance = Math.round(((await sweepr.balanceOf(treasury.address)) / 1e18));
		expect(treasurySweeprBeforeBalance).to.equal(ZERO);

		await tokenDistributor.connect(owner).recover(sweepr.address, sweeprAmount)

		distributorSweeprAfterBalance = Math.round(((await sweepr.balanceOf(tokenDistributor.address)) / 1e18));
		treasurySweeprAfterBalance = Math.round(((await sweepr.balanceOf(treasury.address)) / 1e18));

		expect(distributorSweeprAfterBalance).to.equal(ZERO);
		expect(treasurySweeprAfterBalance).to.equal(sweeprAmount / 1e18);
	});
});

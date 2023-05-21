const { expect } = require("chai");
const { ethers } = require("hardhat");

contract.only("TokenDistributor", async function () {
	before(async () => {
		[owner, sender, lzEndpoint] = await ethers.getSigners();
		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepDollarCoin");
		Sweeper = await ethers.getContractFactory("SWEEPER");
		Treasury = await ethers.getContractFactory("Treasury");
		TokenDistributor = await ethers.getContractFactory("TokenDistributor");
		BlacklistApprover = await ethers.getContractFactory("TransferApproverBlacklist");

		SWEEP_MINT_AMOUNT = ethers.utils.parseUnits("100000", 18);
		SWEEPER_MINT_AMOUNT = ethers.utils.parseUnits("10000", 18);
		PRECISION = 1000000;
		ZERO = 0;

		const Proxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
			owner.address,
			2500 // 0.25%
		]);
		sweep = await Proxy.deployed();

		blacklistApprover = await BlacklistApprover.deploy(sweep.address);
		sweeper = await Sweeper.deploy(sweep.address, blacklistApprover.address);
		tokenDistributor = await TokenDistributor.deploy(sweep.address, sweeper.address);
		treasury = await Treasury.deploy(sweep.address);

		await sweep.setTreasury(treasury.address);

		// mint sweep for sender
		await sweep.connect(owner).addMinter(sender.address, SWEEP_MINT_AMOUNT);
		await sweep.connect(sender).minter_mint(sender.address, SWEEP_MINT_AMOUNT);

		// mint sweeper for TokenDstributor contract
		await sweeper.connect(owner).mint(tokenDistributor.address, SWEEPER_MINT_AMOUNT);
		await sweeper.connect(owner).setPrice(1100000); // 1.1 SWEEP
	});

	it('buys sweeper', async () => {
		expect(await sweeper.balanceOf(sender.address)).to.equal(ZERO);

		sweepAmount = ethers.utils.parseUnits("7000", 18);
		sweeperPrice = await sweeper.price();

		await sweep.connect(sender).approve(tokenDistributor.address, sweepAmount);
		await tokenDistributor.connect(sender).buy(sweepAmount);

		sweeperAmount = Math.round(((sweepAmount * sweeperPrice) / PRECISION) / 1e18);
		senderSweeperBalance = (await sweeper.balanceOf(sender.address)) / 1e18;

		expect(await sweep.balanceOf(tokenDistributor.address)).to.equal(sweepAmount);
		expect(senderSweeperBalance).to.equal(sweeperAmount);
	});

	it('reverts buying sweeper when sweeper balancer of contract is not enough', async () => {
		sweepAmount = ethers.utils.parseUnits("7000", 18);
		sweeperPrice = await sweeper.price();

		sweeperAmount = Math.round(((sweepAmount * sweeperPrice) / PRECISION) / 1e18);
		distributorSweeperBalance = (await sweeper.balanceOf(tokenDistributor.address)) / 1e18;

		expect(distributorSweeperBalance).to.lessThan(sweeperAmount);

		await sweep.connect(sender).approve(tokenDistributor.address, sweepAmount);

		await expect(tokenDistributor.connect(sender).buy(sweepAmount))
			.to.be.revertedWithCustomError(TokenDistributor, 'NotEnoughBalance');
	});

	it('sells sweeper', async () => {
		sellAmount = ethers.utils.parseUnits("1000", 18); // 1000 SWEEPER

		senderSweepBeforeBalance = await sweep.balanceOf(sender.address) / 1e18;
		distributorSweeperBeforeBalance = await sweeper.balanceOf(tokenDistributor.address) / 1e18;

		await sweeper.connect(sender).approve(tokenDistributor.address, sellAmount);
		await tokenDistributor.connect(sender).sell(sellAmount);

		sweepAmount = Math.round(((sellAmount * PRECISION) / sweeperPrice) / 1e18);

		senderSweepAfterBalance = Math.round(((await sweep.balanceOf(sender.address)) / 1e18));
		distributorSweeperAfterBalance = Math.round(((await sweeper.balanceOf(tokenDistributor.address)) / 1e18));

		expect(senderSweepAfterBalance).to.equal(senderSweepBeforeBalance + sweepAmount);
		expect(distributorSweeperAfterBalance).to.equal(distributorSweeperBeforeBalance + (sellAmount / 1e18));
	});

	it('reverts calling recover() function when caller is not owner', async () => {
		sweeperAmount = await sweeper.balanceOf(tokenDistributor.address);

		await expect(tokenDistributor.connect(sender).recover(sweeper.address, sweeperAmount))
			.to.be.revertedWithCustomError(Sweeper, 'OnlyAdmin');
	});

	it('sends all sweeper amount to treasury', async () => {
		sweeperAmount = await sweeper.balanceOf(tokenDistributor.address);

		treasurySweeperBeforeBalance = Math.round(((await sweeper.balanceOf(treasury.address)) / 1e18));
		expect(treasurySweeperBeforeBalance).to.equal(ZERO);

		await tokenDistributor.connect(owner).recover(sweeper.address, sweeperAmount)

		distributorSweeperAfterBalance = Math.round(((await sweeper.balanceOf(tokenDistributor.address)) / 1e18));
		treasurySweeperAfterBalance = Math.round(((await sweeper.balanceOf(treasury.address)) / 1e18));

		expect(distributorSweeperAfterBalance).to.equal(ZERO);
		expect(treasurySweeperAfterBalance).to.equal(sweeperAmount / 1e18);
	});
});

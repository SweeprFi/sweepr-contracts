const { expect } = require("chai");
const { ethers } = require("hardhat");
const { Const } = require("../utils/helper_functions");

contract("TokenDistributor", async function () {
	before(async () => {
		[owner, multisig, sender, lzEndpoint] = await ethers.getSigners();
		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepCoin");
		Sweepr = await ethers.getContractFactory("SweeprCoin");
		Treasury = await ethers.getContractFactory("Treasury");
		TokenDistributor = await ethers.getContractFactory("TokenDistributor");
		BlacklistApprover = await ethers.getContractFactory("TransferApproverBlacklist");

		SWEEP_MINT_AMOUNT = ethers.utils.parseUnits("100000", 18);
		SWEEPR_MINT_AMOUNT = ethers.utils.parseUnits("15000", 18);
		USDC_AMOUNT = ethers.utils.parseUnits("20000", 6);
		SALE_AMOUNT = ethers.utils.parseUnits("10000", 18);
		SALE_PRICE = 1000000; // 1 USDC
		PRECISION = 1000000;
		ZERO = 0;

		const Proxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
			multisig.address,
			2500 // 0.25%
		]);
		sweep = await Proxy.deployed();

		ERC20 = await ethers.getContractFactory("USDCMock");
        usdc = await ERC20.deploy();

		await usdc.transfer(sender.address, USDC_AMOUNT);

		sweepr = await Sweepr.deploy(sweep.address, lzEndpoint.address);
		treasury = await Treasury.deploy(sweep.address);

		await sweep.setTreasury(treasury.address);

		// mint sweep for sender
		await sweep.connect(owner).addMinter(sender.address, SWEEP_MINT_AMOUNT);
		await sweep.connect(sender).minterMint(sender.address, SWEEP_MINT_AMOUNT);

		tokenDistributor = await TokenDistributor.deploy(sweep.address, sweepr.address, treasury.address);

		// mint sweepr for TokenDstributor contract
		await sweepr.connect(owner).mint(tokenDistributor.address, SWEEPR_MINT_AMOUNT);
	});

	it('reverts calling allowSale() function when caller is not owner', async () => {
		await expect(tokenDistributor.connect(sender).allowSale(
			SALE_AMOUNT, 
			sender.address, 
			SALE_PRICE, 
			usdc.address
			)
		).to.be.revertedWithCustomError(Sweepr, 'NotGovOrMultisig');
	});

	it('allow sale correctly', async () => {
		await tokenDistributor.connect(multisig).allowSale(
			SALE_AMOUNT, 
			sender.address, 
			SALE_PRICE, 
			usdc.address
		);

		expect(await tokenDistributor.saleAmount()).to.equal(SALE_AMOUNT);
		expect(await tokenDistributor.salePrice()).to.equal(SALE_PRICE);
		expect(await tokenDistributor.sellTo()).to.equal(sender.address);
		expect(await tokenDistributor.payToken()).to.equal(usdc.address);
	});

	it('reverts buying sweepr when caller is not equal to recipient address', async () => {
		await expect(tokenDistributor.connect(multisig).buy(SALE_AMOUNT))
			.to.be.revertedWithCustomError(TokenDistributor, 'NotRecipient');
	});

	it('reverts buying sweepr when required sweepr amount is greater than sale amount', async () => {
		tokenAmount = ethers.utils.parseUnits("15000", 6);

		// revert buying, because required sweepr amount(15K) is greater than sale amount(10K)
		await expect(tokenDistributor.connect(sender).buy(tokenAmount))
			.to.be.revertedWithCustomError(TokenDistributor, 'OverSaleAmount');
	});

	it('buys sweepr correctly', async () => {
		expect(await sweepr.balanceOf(sender.address)).to.equal(ZERO);

		tokenAmount = ethers.utils.parseUnits("10000", 6);
		await usdc.connect(sender).approve(tokenDistributor.address, tokenAmount);

		await tokenDistributor.connect(sender).buy(tokenAmount);

		sweeprAmount = Math.round(((tokenAmount * PRECISION) / SALE_PRICE) / 1e6);
		senderSweeprBalance = (await sweepr.balanceOf(sender.address)) / 1e18;

		expect(await usdc.balanceOf(treasury.address)).to.equal(tokenAmount);
		expect(senderSweeprBalance).to.equal(sweeprAmount);
	});

	it('reverts buying sweepr when there is no enough Sweepr balance in TokenDistributor contract', async () => {
		tokenAmount = ethers.utils.parseUnits("10000", 6);
		sweeprAmount = Math.round(((tokenAmount * PRECISION) / SALE_PRICE) / 1e6);

		expect(Math.round(await sweepr.balanceOf(tokenDistributor.address) / 1e18)).to.below(sweeprAmount);

		// revert buying, because there is no enough sweepr balance
		await expect(tokenDistributor.connect(sender).buy(tokenAmount))
			.to.be.revertedWithCustomError(TokenDistributor, 'NotEnoughBalance');
	});

	it('burn Sweepr correctly', async () => {
		sweeprBalance = await sweepr.balanceOf(tokenDistributor.address)
		expect(sweeprBalance).to.above(Const.ZERO);

		await tokenDistributor.burn();

		expect(await sweepr.balanceOf(tokenDistributor.address)).to.equal(Const.ZERO);

		// revert buying, because saleAmount is 0
		tokenAmount = ethers.utils.parseUnits("10000", 6);
		await expect(tokenDistributor.connect(sender).buy(tokenAmount))
			.to.be.revertedWithCustomError(TokenDistributor, 'NotEnoughBalance');
	});

	it('revoke sale correctly', async () => {
		expect(await tokenDistributor.saleAmount()).to.above(Const.ZERO);

		await tokenDistributor.revokeSale();

		expect(await tokenDistributor.saleAmount()).to.equal(Const.ZERO);

		// revert buying, because saleAmount is 0
		tokenAmount = ethers.utils.parseUnits("10000", 6);
		await expect(tokenDistributor.connect(sender).buy(tokenAmount))
			.to.be.revertedWithCustomError(TokenDistributor, 'OverSaleAmount');
	});
});

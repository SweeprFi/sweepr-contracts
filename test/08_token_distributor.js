const { expect } = require("chai");
const { ethers } = require("hardhat");
const { Const } = require("../utils/helper_functions");

contract("TokenDistributor", async function () {
	before(async () => {
		[owner, multisig, sender, other, lzEndpoint] = await ethers.getSigners();
		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepCoin");
		Sweepr = await ethers.getContractFactory("SweeprCoin");
		Treasury = await ethers.getContractFactory("Treasury");
		TokenDistributor = await ethers.getContractFactory("TokenDistributor");

		SWEEP_MINT_AMOUNT = ethers.utils.parseUnits("100000", 18);
		SWEEPR_MINT_AMOUNT = ethers.utils.parseUnits("15000", 18);
		USDC_AMOUNT = ethers.utils.parseUnits("20000", 6);
		SALE_AMOUNT = ethers.utils.parseUnits("20000", 18);
		USDC_SALE_PRICE = 1000000; // 1 USDC
		SWEEP_SALE_PRICE = ethers.utils.parseUnits("2", 18); // 2 SWEEP
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
		await sweep.connect(sender).mint(SWEEP_MINT_AMOUNT);

		tokenDistributor = await TokenDistributor.deploy(sweepr.address, treasury.address);

		// mint sweepr for TokenDstributor contract
		await sweepr.connect(owner).mint(tokenDistributor.address, SWEEPR_MINT_AMOUNT);
	});

	it('revert calling allowSale() function when caller is not owner', async () => {
		await expect(tokenDistributor.connect(sender).allowSale(
			SALE_AMOUNT,
			sender.address,
			USDC_SALE_PRICE,
			usdc.address
		)
		).to.be.revertedWithCustomError(TokenDistributor, 'NotOwner');
	});

	it('revert calling allowSale() function when sellAmount or sellPrice is zero', async () => {
		await expect(tokenDistributor.connect(owner).allowSale(
			0,
			sender.address,
			USDC_SALE_PRICE,
			usdc.address
		)
		).to.be.revertedWithCustomError(TokenDistributor, 'ZeroAmount');

		await expect(tokenDistributor.connect(owner).allowSale(
			SALE_AMOUNT,
			sender.address,
			0,
			usdc.address
		)
		).to.be.revertedWithCustomError(TokenDistributor, 'ZeroPrice');
	});

	it('revert calling allowSale() function when zero address id detected', async () => {
		await expect(tokenDistributor.connect(owner).allowSale(
			SALE_AMOUNT,
			Const.ADDRESS_ZERO,
			USDC_SALE_PRICE,
			usdc.address
		)
		).to.be.revertedWithCustomError(TokenDistributor, 'ZeroAddressDetected');

		await expect(tokenDistributor.connect(owner).allowSale(
			SALE_AMOUNT,
			sender.address,
			USDC_SALE_PRICE,
			Const.ADDRESS_ZERO
		)
		).to.be.revertedWithCustomError(TokenDistributor, 'ZeroAddressDetected');
	});

	it('allow sale correctly', async () => {
		await tokenDistributor.connect(owner).allowSale(
			SALE_AMOUNT,
			sender.address,
			USDC_SALE_PRICE,
			usdc.address
		);

		expect(await tokenDistributor.saleAmount()).to.equal(SALE_AMOUNT);
		expect(await tokenDistributor.salePrice()).to.equal(USDC_SALE_PRICE);
		expect(await tokenDistributor.sellTo()).to.equal(sender.address);
		expect(await tokenDistributor.payToken()).to.equal(usdc.address);
	});

	it('revert buying sweepr when caller is not equal to recipient address', async () => {
		await expect(tokenDistributor.connect(owner).buy(SALE_AMOUNT))
			.to.be.revertedWithCustomError(TokenDistributor, 'NotRecipient');
	});

	it('revert buying sweepr when required sweepr amount is greater than sale amount', async () => {
		tokenAmount = ethers.utils.parseUnits("25000", 6);

		// revert buying, because required sweepr amount(15K) is greater than sale amount(10K)
		await expect(tokenDistributor.connect(sender).buy(tokenAmount))
			.to.be.revertedWithCustomError(TokenDistributor, 'OverSaleAmount');
	});

	it('buy sweepr correctly', async () => {
		expect(await sweepr.balanceOf(sender.address)).to.equal(ZERO);

		saleAmountBefore = Math.round(await tokenDistributor.saleAmount() / 1e18);

		tokenAmount = ethers.utils.parseUnits("10000", 6);
		await usdc.connect(sender).approve(tokenDistributor.address, tokenAmount);

		await tokenDistributor.connect(sender).buy(tokenAmount);

		sweeprAmount = Math.round(((tokenAmount * PRECISION) / USDC_SALE_PRICE) / 1e6);
		senderSweeprBalance = (await sweepr.balanceOf(sender.address)) / 1e18;
		saleAmountAfter = Math.round(await tokenDistributor.saleAmount() / 1e18);

		expect(await usdc.balanceOf(treasury.address)).to.equal(tokenAmount);
		expect(senderSweeprBalance).to.equal(sweeprAmount);
		expect(saleAmountAfter).to.equal(saleAmountBefore - sweeprAmount);
	});

	it('revert buying sweepr when there is no enough Sweepr balance in TokenDistributor contract', async () => {
		tokenAmount = ethers.utils.parseUnits("7000", 6);
		sweeprAmount = Math.round(((tokenAmount * PRECISION) / USDC_SALE_PRICE) / 1e6);

		expect(Math.round(await sweepr.balanceOf(tokenDistributor.address) / 1e18)).to.below(sweeprAmount);

		// revert buying, because there is no enough sweepr balance
		await expect(tokenDistributor.connect(sender).buy(tokenAmount))
			.to.be.revertedWithCustomError(TokenDistributor, 'NotEnoughBalance');
	});

	it('buy sweepr again', async () => {
		saleAmountBefore = Math.round(await tokenDistributor.saleAmount() / 1e18);
		senderBalanceBefore = (await sweepr.balanceOf(sender.address)) / 1e18;
		treasuryBalanceBefore = (await usdc.balanceOf(treasury.address)) / 1e6;

		tokenAmount = ethers.utils.parseUnits("3000", 6);
		await usdc.connect(sender).approve(tokenDistributor.address, tokenAmount);

		await tokenDistributor.connect(sender).buy(tokenAmount);

		sweeprAmount = Math.round(((tokenAmount * PRECISION) / USDC_SALE_PRICE) / 1e6);
		senderBalanceAfter = (await sweepr.balanceOf(sender.address)) / 1e18;
		treasuryBalanceAfter = (await usdc.balanceOf(treasury.address)) / 1e6;
		saleAmountAfter = Math.round(await tokenDistributor.saleAmount() / 1e18);

		expect(treasuryBalanceAfter).to.equal(treasuryBalanceBefore + tokenAmount / 1e6);
		expect(senderBalanceAfter).to.equal(senderBalanceBefore + sweeprAmount);
		expect(saleAmountAfter).to.equal(saleAmountBefore - sweeprAmount);
	});

	it('burn Sweepr correctly', async () => {
		sweeprBalance = await sweepr.balanceOf(tokenDistributor.address)
		expect(sweeprBalance).to.above(Const.ZERO);

		await tokenDistributor.burn();

		expect(await sweepr.balanceOf(tokenDistributor.address)).to.equal(Const.ZERO);

		// revert buying, because saleAmount is 0
		tokenAmount = ethers.utils.parseUnits("1000", 6);
		await expect(tokenDistributor.connect(sender).buy(tokenAmount))
			.to.be.revertedWithCustomError(TokenDistributor, 'NotEnoughBalance');
	});

	it('revoke sale correctly', async () => {
		expect(await tokenDistributor.saleAmount()).to.above(Const.ZERO);

		await tokenDistributor.revokeSale();

		expect(await tokenDistributor.saleAmount()).to.equal(Const.ZERO);

		// revert buying, because saleAmount is 0
		tokenAmount = ethers.utils.parseUnits("1000", 6);
		await expect(tokenDistributor.connect(sender).buy(tokenAmount))
			.to.be.revertedWithCustomError(TokenDistributor, 'OverSaleAmount');
	});

	it('allow sale for other user', async () => {
		// add minter
		await sweep.connect(owner).addMinter(other.address, SWEEP_MINT_AMOUNT);
		await sweep.connect(other).mint(SWEEP_MINT_AMOUNT);

		// mint sweepr again for TokenDstributor contract
		await sweepr.connect(owner).mint(tokenDistributor.address, SWEEPR_MINT_AMOUNT);

		await tokenDistributor.connect(owner).allowSale(
			SALE_AMOUNT,
			other.address,
			SWEEP_SALE_PRICE,
			sweep.address
		);

		expect(await tokenDistributor.saleAmount()).to.equal(SALE_AMOUNT);
		expect(await tokenDistributor.salePrice()).to.equal(SWEEP_SALE_PRICE);
		expect(await tokenDistributor.sellTo()).to.equal(other.address);
		expect(await tokenDistributor.payToken()).to.equal(sweep.address);
	});

	it('buy sweepr by other user', async () => {
		expect(await sweepr.balanceOf(other.address)).to.equal(ZERO);

		saleAmountBefore = Math.round(await tokenDistributor.saleAmount() / 1e18);

		tokenAmount = ethers.utils.parseUnits("10000", 18);
		await sweep.connect(other).approve(tokenDistributor.address, tokenAmount);

		await tokenDistributor.connect(other).buy(tokenAmount);

		sweeprAmount = Math.round(((tokenAmount * 1e18) / SWEEP_SALE_PRICE) / 1e18);
		senderSweeprBalance = (await sweepr.balanceOf(other.address)) / 1e18;
		saleAmountAfter = Math.round(await tokenDistributor.saleAmount() / 1e18);

		expect(await sweep.balanceOf(treasury.address)).to.equal(tokenAmount);
		expect(senderSweeprBalance).to.equal(sweeprAmount);
		expect(saleAmountAfter).to.equal(saleAmountBefore - sweeprAmount);
	});
});

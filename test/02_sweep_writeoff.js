const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { toBN, Const } = require("../utils/helper_functions");

contract("Sweep - WriteOff", async function () {
	before(async () => {
		[wallet, lzEndpoint, borrower] = await ethers.getSigners();

		newTargetPrice = 0.75e6;
		usdxAmount = 1000e6;
		sweepAmount = toBN("1000", 18);
		maxBorrow = toBN("100000", 18);
		borrowAmount = toBN("8500", 18);
		investAmount = 1000e6;

		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepCoin");
		const Proxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
			addresses.owner,
			2500 // 0.25%
		]);
		sweep = await Proxy.deployed();

		// USDX
		Token = await ethers.getContractFactory("USDCMock");
		usdx = await Token.deploy();

		// AMM
		Uniswap = await ethers.getContractFactory("UniswapMock");
		amm = await Uniswap.deploy(sweep.address, Const.FEE);
		await sweep.setAMM(amm.address);

		// Oracle
		Oracle = await ethers.getContractFactory("AggregatorMock");
		wbtcOracle = await Oracle.deploy();

		// OffChain Asset
		OffChainAsset = await ethers.getContractFactory("OffChainAsset");
		offChainAsset = await OffChainAsset.deploy(
			'OffChain Asset',
			sweep.address,
			usdx.address,
			wallet.address,
			amm.address,
			addresses.oracle_usdc_usd,
			borrower.address
		);

		// WBTC Asset
		WBTCAsset = await ethers.getContractFactory("TokenAsset");
		wbtcAsset = await WBTCAsset.deploy(
			'WBTC Asset',
			sweep.address,
			usdx.address,
			addresses.wbtc,
			addresses.oracle_usdc_usd,
			wbtcOracle.address,
			borrower.address,
			Const.FEE
		);

		wethAsset = await WBTCAsset.deploy(
			'WETH Asset',
			sweep.address,
			usdx.address,
			addresses.weth,
			addresses.oracle_usdc_usd,
			wbtcOracle.address,
			borrower.address,
			Const.FEE
		);

		AaveAsset = await ethers.getContractFactory("AaveV3Asset");
		aaveAsset = await AaveAsset.deploy(
			'Aave Asset',
			sweep.address,
			usdx.address,
			addresses.aave_usdc,
			addresses.aaveV3_pool,
			addresses.oracle_usdc_usd,
			borrower.address,
		);
	});

	function pp(v, d) { return ethers.utils.formatUnits(v.toString(), d) }

	it('Initial Setting', async () => {
		// Add minter
		await sweep.addMinter(offChainAsset.address, maxBorrow);
		await sweep.addMinter(wbtcAsset.address, maxBorrow);
		await sweep.addMinter(wethAsset.address, maxBorrow);
		await sweep.addMinter(aaveAsset.address, maxBorrow);
		await sweep.addMinter(wallet.address, maxBorrow);
		await sweep.mint(maxBorrow);

		// Send tokens to the AMM
		await usdx.transfer(amm.address, usdxAmount);
		await sweep.transfer(amm.address, sweepAmount);

		await sweep.removeMinter(wallet.address);

		// Config asset
		await offChainAsset.connect(borrower).configure(
			Const.RATIO, Const.spreadFee, maxBorrow, Const.ZERO, Const.DAYS_5,
			Const.RATIO, maxBorrow, Const.ZERO, Const.FALSE, Const.FALSE, Const.URL
		);

		await wbtcAsset.connect(borrower).configure(
			Const.RATIO, Const.spreadFee, maxBorrow, Const.ZERO, Const.DAYS_5,
			Const.RATIO, maxBorrow, Const.ZERO, Const.FALSE, Const.FALSE, Const.URL
		);

		await wethAsset.connect(borrower).configure(
			Const.RATIO, Const.spreadFee, maxBorrow, Const.ZERO, Const.DAYS_5,
			Const.RATIO, maxBorrow, Const.ZERO, Const.FALSE, Const.FALSE, Const.URL
		);
	});

	it('Borrow Sweep on the asset', async () => {
		expect(await offChainAsset.sweepBorrowed()).to.equal(Const.ZERO);
		expect(await wbtcAsset.sweepBorrowed()).to.equal(Const.ZERO);
		expect(await wethAsset.sweepBorrowed()).to.equal(Const.ZERO);
		// Deposit USDC 
		expect(await usdx.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);
		expect(await usdx.balanceOf(wbtcAsset.address)).to.equal(Const.ZERO);
		expect(await usdx.balanceOf(wethAsset.address)).to.equal(Const.ZERO);

		await usdx.transfer(offChainAsset.address, investAmount);
		await usdx.transfer(wbtcAsset.address, investAmount);
		await usdx.transfer(wethAsset.address, investAmount);

		// Mint Sweep
		await offChainAsset.connect(borrower).borrow(borrowAmount);
		await wbtcAsset.connect(borrower).borrow(borrowAmount);
		await wethAsset.connect(borrower).borrow(borrowAmount);

		expect(await offChainAsset.sweepBorrowed()).to.equal(borrowAmount);
		expect(await wbtcAsset.sweepBorrowed()).to.equal(borrowAmount);
		expect(await wethAsset.sweepBorrowed()).to.equal(borrowAmount);
	});

	it('Run WriteOff', async () => {
		// Check pause of sweep
		expect(await sweep.paused()).to.equal(false);
		await expect(sweep.writeOff(newTargetPrice, offChainAsset.address))
			.to.be.revertedWith('Pausable: not paused');
		// Pause sweep
		await sweep.pause();
		expect(await sweep.paused()).to.equal(true);

		// Check caller
		await expect(offChainAsset.updateSweepBorrowed(sweepAmount))
			.to.be.revertedWithCustomError(offChainAsset, 'NotSweep');

		price = await sweep.targetPrice();
		await amm.setPrice(price.mul(2));
		await expect(sweep.writeOff(newTargetPrice, offChainAsset.address))
			.to.be.revertedWithCustomError(sweep, "WriteOffNotAllowed")

		await amm.setPrice(price);
		await sweep.writeOff(newTargetPrice, offChainAsset.address);

		expect(await offChainAsset.sweepBorrowed()).to.equal(borrowAmount);
		expect(await aaveAsset.sweepBorrowed()).to.equal(Const.ZERO);
		expect(await wbtcAsset.sweepBorrowed()).to.above(borrowAmount);
		expect(await wethAsset.sweepBorrowed()).to.above(borrowAmount);
	});
});

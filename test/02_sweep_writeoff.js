const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { toBN, Const } = require("../utils/helper_functions");

contract("Sweep - WriteOff", async function () {
	before(async () => {
		[wallet, lzEndpoint, borrower] = await ethers.getSigners();

		newTargetPrice = 0.95e6;
		usdxAmount = 1000e6;
		sweepAmount = toBN("1000", 18);
		maxBorrow = toBN("1000", 18);
		mintAmount = toBN("100", 18);
		investAmount = 100e6;

		// ------------- Deployment of contracts -------------

		// SWEEP
		Sweep = await ethers.getContractFactory("SweepMock");
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
			borrower.address
		);

		// WBTC Asset
		WBTCAsset = await ethers.getContractFactory("TokenAsset");
		wbtcAsset = await WBTCAsset.deploy(
			'WBTC Asset',
			sweep.address,
			usdx.address,
			addresses.wbtc,
			wbtcOracle.address,
			borrower.address
		);
	});

	it('Initial Setting', async () => {
		// Add minter
		await sweep.addMinter(offChainAsset.address, maxBorrow);
		await sweep.addMinter(wbtcAsset.address, maxBorrow);

		// Send tokens to the AMM
		await usdx.transfer(amm.address, usdxAmount);
		await sweep.transfer(amm.address, sweepAmount);

		// Config asset
		await offChainAsset.connect(borrower).configure(
			Const.RATIO,
			Const.spreadFee,
			maxBorrow,
			Const.DISCOUNT,
			Const.DAYS_5,
			Const.RATIO,
			maxBorrow,
			Const.FALSE,
			Const.URL
		);

		await wbtcAsset.connect(borrower).configure(
			Const.RATIO,
			Const.spreadFee,
			maxBorrow,
			Const.DISCOUNT,
			Const.DAYS_5,
			Const.RATIO,
			maxBorrow,
			Const.FALSE,
			Const.URL
		);
	});

	it('Borrow Sweep on the asset', async () => {
		// Deposit USDC 
		expect(await usdx.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);
		expect(await usdx.balanceOf(wbtcAsset.address)).to.equal(Const.ZERO);
		await usdx.transfer(offChainAsset.address, investAmount);
		await usdx.transfer(wbtcAsset.address, investAmount);
		expect(await usdx.balanceOf(offChainAsset.address)).to.above(Const.ZERO);
		expect(await usdx.balanceOf(wbtcAsset.address)).to.above(Const.ZERO);

		// Mint Sweep
		expect(await offChainAsset.sweepBorrowed()).to.equal(Const.ZERO);
		expect(await wbtcAsset.sweepBorrowed()).to.equal(Const.ZERO);
		await offChainAsset.connect(borrower).borrow(mintAmount);
		await wbtcAsset.connect(borrower).borrow(mintAmount);
		expect(await offChainAsset.sweepBorrowed()).to.above(Const.ZERO);
		expect(await wbtcAsset.sweepBorrowed()).to.above(Const.ZERO);
	});

	it('Run WriteOff', async () => {
		// Check pause of sweep
		expect(await sweep.paused()).to.equal(false);
		await expect(sweep.writeOff(newTargetPrice)).to.be.revertedWith('Pausable: not paused');
		// Pause sweep
		await sweep.pause();
		expect(await sweep.paused()).to.equal(true);

		// Check caller
		await expect(offChainAsset.updateSweepBorrowed(sweepAmount)).to.be.revertedWithCustomError(offChainAsset, 'NotSweep');
		
		await sweep.writeOff(newTargetPrice);

		expect(await offChainAsset.sweepBorrowed()).to.above(mintAmount);
		expect(await wbtcAsset.sweepBorrowed()).to.above(mintAmount);
	});
});

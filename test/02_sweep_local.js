const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { toBN, Const } = require("../utils/helper_functions");

contract("Sweep", async function () {
	before(async () => {
		[owner, multisig, receiver, treasury, newAddress, newMinter, lzEndpoint] = await ethers.getSigners();

		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepDollarCoin");

		TRANSFER_AMOUNT = toBN("100", 18);
		INTEREST_RATE = 5e4; // 5%

		const Proxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
            addresses.owner,
            addresses.approver,
            addresses.treasury,
            2500 // 0.25%
		]);
		sweep = await Proxy.deployed(Sweep);

		BlacklistApprover = await ethers.getContractFactory("TransferApproverBlacklist");
		WhitelistApprover = await ethers.getContractFactory("TransferApproverWhitelist");
		blacklistApprover = await BlacklistApprover.deploy(sweep.address);
		whitelistApprover = await WhitelistApprover.deploy(sweep.address);
	});

	it('set admin to multisig', async () => {
		// Transfer ownership to multisig
		await sweep.connect(owner).transferOwnership(multisig.address);
		expect(await sweep.owner()).to.equal(multisig.address);
	});

	it('gets the target price correctly', async () => {
		targetPrice = await sweep.target_price();
		expect(await sweep.current_target_price()).to.equal(targetPrice);
	});

	it('sets a new period time correctly', async () => {
		period_time = await sweep.period_time();
		await sweep.connect(multisig).setPeriodTime(Const.ZERO);
		new_period_time = await sweep.period_time();

		expect(period_time).to.equal(604800);
		expect(new_period_time).to.equal(Const.ZERO);
	});

	it('sets a new oracle and gets price correctly', async () => {
		expect(await sweep.uniswapOracle()).to.equal(Const.ADDRESS_ZERO);
		oracle = addresses.uniswap_oracle;

		await sweep.connect(multisig).setUniswapOracle(oracle);

		expect(await sweep.uniswapOracle()).to.equal(oracle);

		price = await sweep.amm_price();
		expect(price).to.above(Const.ZERO);
	});

	it('sets a new balancer address correctly', async () => {
		expect(await sweep.balancer()).to.equal(Const.ADDRESS_ZERO);
		await sweep.connect(multisig).setBalancer(newAddress.address);
		expect(await sweep.balancer()).to.equal(newAddress.address);
	});

	it('sets a new current target price correctly', async () => {
		expect(await sweep.current_target_price()).to.equal(await sweep.next_target_price());
		await sweep.connect(newAddress).setTargetPrice(90000, 99000);
		expect(await sweep.current_target_price()).to.equal(90000);
		expect(await sweep.next_target_price()).to.equal(99000);
	});

	it('starts a new period correctly', async () => {
		period_start = await sweep.period_start();
		await sweep.connect(newAddress).startNewPeriod();
		new_period_start = await sweep.period_start();

		expect(new_period_start).to.above(period_start);
	});

	it('upgrades Sweep', async () => {
		await sweep.connect(newAddress).setInterestRate(INTEREST_RATE);
		const interestRateBefore = await sweep.interest_rate();

		// Sweep Upgrade
		Sweep2 = await ethers.getContractFactory("SweepDollarCoin");
		upgraded = await upgrades.upgradeProxy(sweep.address, Sweep2);

		const interestRateAfter = await sweep.interest_rate();

		// Check to see if upgraded Sweep contract keeps interest rate of previous contract
		expect(interestRateBefore.toNumber()).to.equal(interestRateAfter.toNumber());
	});

	it('sets a new minter and gets his information correctly', async () => {
		expect(await sweep.isValidMinter(newMinter.address)).to.equal(Const.FALSE);

		await sweep.connect(multisig).addMinter(newMinter.address, TRANSFER_AMOUNT);
		expect(await sweep.isValidMinter(newMinter.address)).to.equal(Const.TRUE);
		minterInfo = await sweep.minters(newMinter.address);

		expect(minterInfo.max_amount).to.equal(TRANSFER_AMOUNT);
		expect(minterInfo.minted_amount).to.equal(Const.ZERO);
		expect(minterInfo.is_listed).to.equal(Const.TRUE);
		expect(minterInfo.is_enabled).to.equal(Const.TRUE);
	});

	it('mints SWEEP for a valid minter', async () => {
		await expect(sweep.connect(treasury).minter_mint(newMinter.address, 10))
			.to.be.revertedWithCustomError(Sweep, 'InvalidMinter');

		await sweep.connect(newMinter).minter_mint(newMinter.address, 10)
		minterInfo = await sweep.minters(newMinter.address);

		expect(minterInfo.max_amount).to.equal(TRANSFER_AMOUNT);
		expect(minterInfo.minted_amount).to.equal(10);
		expect(minterInfo.is_listed).to.equal(Const.TRUE);
		expect(minterInfo.is_enabled).to.equal(Const.TRUE);
	});

	it('burns SWEEP for a valid minter', async () => {
		await expect(sweep.connect(treasury).minter_burn_from(10))
			.to.be.revertedWithCustomError(Sweep, 'InvalidMinter');

		await sweep.connect(newMinter).minter_burn_from(10)
		minterInfo = await sweep.minters(newMinter.address);

		expect(minterInfo.max_amount).to.equal(TRANSFER_AMOUNT);
		expect(minterInfo.minted_amount).to.equal(Const.ZERO);
		expect(minterInfo.is_listed).to.equal(Const.TRUE);
		expect(minterInfo.is_enabled).to.equal(Const.TRUE);
	});

	it('sets a new config for a minter correctly', async () => {
		await sweep.connect(multisig).setMinterMaxAmount(newMinter.address, TRANSFER_AMOUNT.mul(2));
		minterInfo = await sweep.minters(newMinter.address);

		expect(minterInfo.max_amount).to.equal(TRANSFER_AMOUNT.mul(2));
		expect(minterInfo.minted_amount).to.equal(Const.ZERO);
		expect(minterInfo.is_listed).to.equal(Const.TRUE);
		expect(minterInfo.is_enabled).to.equal(Const.TRUE);

		await sweep.connect(newMinter).minter_mint(newMinter.address, TRANSFER_AMOUNT);
		await sweep.connect(multisig).setMinterEnabled(newMinter.address, Const.FALSE);
		minterInfo = await sweep.minters(newMinter.address);

		expect(minterInfo.max_amount).to.equal(TRANSFER_AMOUNT.mul(2));
		expect(minterInfo.minted_amount).to.equal(TRANSFER_AMOUNT);
		expect(minterInfo.is_listed).to.equal(Const.TRUE);
		expect(minterInfo.is_enabled).to.equal(Const.FALSE);
	});

	it('removes from minters list', async () => {
        await sweep.connect(multisig).removeMinter(newMinter.address);
		expect(await sweep.isValidMinter(newMinter.address)).to.equal(Const.FALSE);
    });
});

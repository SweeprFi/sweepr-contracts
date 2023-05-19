const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { toBN, Const } = require("../utils/helper_functions");

contract("Sweep - Mint", async function () {
	before(async () => {
		[owner, receiver, treasury, newAddress, newMinter, lzEndpoint] = await ethers.getSigners();

		TRANSFER_AMOUNT = toBN("100", 18);
		INTEREST_RATE = 5e4; // 5%
		// ------------- Deployment of contracts -------------
		BlacklistApprover = await ethers.getContractFactory("TransferApproverBlacklist");
		WhitelistApprover = await ethers.getContractFactory("TransferApproverWhitelist");
		Sweep = await ethers.getContractFactory("SweepMock");

		const Proxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
            addresses.owner,
            addresses.approver,
            addresses.treasury,
            2500 // 0.25%
		]);
		sweep = await Proxy.deployed();

		blacklistApprover = await BlacklistApprover.deploy(sweep.address);
		whitelistApprover = await WhitelistApprover.deploy(sweep.address);
	});

	it('add and remove minters', async () => {
		// Add minter
		assets = [
			addresses.aaveV3_pool, 
			addresses.asset_offChain, 
			addresses.asset_wbtc, 
			addresses.asset_weth, 
			addresses.asset_uniswap
		];

		await Promise.all(
			assets.map(async (asset) => {
				await sweep.connect(owner).addMinter(asset, TRANSFER_AMOUNT);
			})
		);

		await Promise.all(
			assets.map(async (asset, index) => {
				expect(await sweep.minter_addresses(index)).equal(asset);
			})
		);

		// Remove minter
		await sweep.connect(owner).removeMinter(addresses.asset_offChain);

		minters = await sweep.getMinters();

		is_found = Const.FALSE;
		minters.map(async (minter) => {
			if (minter == addresses.asset_offChain) is_found = Const.TRUE;
		})

		expect(is_found).equal(Const.FALSE);
	});

	it('transfers tokens when unpaused and unblacklisted', async () => {
		await sweep.connect(owner).addMinter(newMinter.address, TRANSFER_AMOUNT);
		await sweep.connect(newMinter).minter_mint(newAddress.address, TRANSFER_AMOUNT);

		let receiverBalance = await sweep.balanceOf(receiver.address);
		expect(receiverBalance).to.equal(Const.ZERO);

		await sweep.connect(newAddress).transfer(receiver.address, TRANSFER_AMOUNT)

		expect(await sweep.balanceOf(newAddress.address)).to.equal(Const.ZERO);
		expect(await sweep.balanceOf(receiver.address)).to.equal(TRANSFER_AMOUNT);
	});

	it('reverts transfer when paused', async () => {
		let receiverBalance = await sweep.balanceOf(receiver.address);
		expect(receiverBalance).to.equal(TRANSFER_AMOUNT);

		// Pause sweep
		await sweep.connect(owner).pause();

		await expect(sweep.connect(owner).transfer(receiver.address, TRANSFER_AMOUNT))
			.to.be.revertedWith("Pausable: paused");
	});

	it('reverts transfer when receiver is blacklisted', async () => {
		await sweep.connect(owner).unpause();
		let receiverBalance = await sweep.balanceOf(receiver.address);
		expect(receiverBalance).to.equal(TRANSFER_AMOUNT);
		expect(await blacklistApprover.isBlacklisted(receiver.address)).to.equal(false);

		// Add receiver into blocklist
		await blacklistApprover.connect(owner).blacklist(receiver.address);

		expect(await blacklistApprover.isBlacklisted(receiver.address)).to.equal(true);

		await expect(sweep.connect(owner).transfer(receiver.address, TRANSFER_AMOUNT))
				.to.be.revertedWithCustomError(Sweep, 'TransferNotAllowed');
	});

	it('transfers token when receiver is unblacklisted', async () => {
		let receiverBalance = await sweep.balanceOf(receiver.address);
		expect(receiverBalance).to.equal(TRANSFER_AMOUNT);

		// Unblacklist receiver
		await blacklistApprover.connect(owner).unBlacklist(receiver.address);

		await sweep.connect(receiver).transfer(newAddress.address, TRANSFER_AMOUNT)

		expect(await sweep.balanceOf(receiver.address)).to.equal(Const.ZERO);
		expect(await sweep.balanceOf(newAddress.address)).to.equal(TRANSFER_AMOUNT);
	});

	it('transfers token when receiver is whitelisted', async () => {
		// whitelist receiver
		expect(await whitelistApprover.isWhitelisted(receiver.address)).to.equal(Const.FALSE);
		await whitelistApprover.connect(owner).whitelist(receiver.address);

		await sweep.connect(newAddress).transfer(receiver.address, TRANSFER_AMOUNT)

		expect(await sweep.balanceOf(newAddress.address)).to.equal(Const.ZERO);
		expect(await sweep.balanceOf(receiver.address)).to.equal(TRANSFER_AMOUNT);

		// unwhitelist receiver
		await whitelistApprover.connect(owner).unWhitelist(receiver.address);

		await expect(sweep.connect(receiver).transfer(owner.address, TRANSFER_AMOUNT))
				.to.be.revertedWithCustomError(Sweep, 'TransferNotAllowed');
	});

	it('burns Sweeps correctly', async () => {
		MAX_MINT_AMOUNT = toBN("500", 18);
		await sweep.connect(owner).setMinterEnabled(newMinter.address, Const.TRUE);
		await sweep.connect(owner).setMinterMaxAmount(newMinter.address, MAX_MINT_AMOUNT);

		expect(await sweep.balanceOf(newMinter.address)).to.equal(Const.ZERO);
		await sweep.connect(newMinter).minter_mint(newMinter.address, TRANSFER_AMOUNT);

		expect(await sweep.balanceOf(newMinter.address)).to.equal(TRANSFER_AMOUNT);

		await sweep.connect(newMinter).minter_burn_from(TRANSFER_AMOUNT);
		expect(await sweep.balanceOf(newMinter.address)).to.equal(Const.ZERO);
	});

	it('allow and disallow minting', async () => {
		// Set new amm price
		NEW_AMM_PRICE = 999990;
		await sweep.connect(owner).setAMMPrice(NEW_AMM_PRICE);

		//  Mint should be reverted because amm_price < (1 - arb_spread) * target_price
		//	Here,  amm_price = 990000, target_price = 1000000, arb_spread = 0
		//	999990 < 1000000
        await expect(
            sweep.connect(newMinter).minter_mint(newAddress.address, TRANSFER_AMOUNT)
        ).to.be.revertedWithCustomError(Sweep, 'MintNotAllowed');

		// Set new arb_spread
		NEW_ARB_SPREAD = 1000; // 0.1%
		await sweep.connect(owner).setArbSpread(NEW_ARB_SPREAD);

		expect(await sweep.balanceOf(newAddress.address)).to.equal(Const.ZERO);

		//  Mint should be allowed because amm_price > (1 - arb_spread) * target_price
		//	Here,  amm_price = 990000, target_price = 1000000, arb_spread = 1000
		//	999990 > 999000
		await sweep.connect(newMinter).minter_mint(newAddress.address, TRANSFER_AMOUNT)

		expect(await sweep.balanceOf(newAddress.address)).to.equal(TRANSFER_AMOUNT);
    });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { toBN, Const } = require("../utils/helper_functions");

contract("Sweep - Mint", async function () {
	before(async () => {
		[owner, receiver, treasury, newAddress, newMinter, lzEndpoint] = await ethers.getSigners();

		TRANSFER_AMOUNT = toBN("100", 18);
		interestRate = 5e4; // 5%
		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepCoin");

		const Proxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
			addresses.owner,
			2500 // 0.25%
		]);
		sweep = await Proxy.deployed();
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
				expect(await sweep.minterAddresses(index)).equal(asset);
			})
		);

		await expect(sweep.connect(lzEndpoint).addMinter(lzEndpoint.address, TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(sweep, "NotGovernance");

		await expect(sweep.connect(owner).addMinter(Const.ADDRESS_ZERO, TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(sweep, "ZeroAddressDetected");

		await expect(sweep.connect(owner).addMinter(lzEndpoint.address, Const.ZERO))
			.to.be.revertedWithCustomError(sweep, "ZeroAmountDetected");

		await expect(sweep.connect(owner).addMinter(assets[0], TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(sweep, "MinterExist");

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
		await sweep.connect(newMinter).minterMint(newAddress.address, TRANSFER_AMOUNT);

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
		await expect(sweep.connect(newAddress).pause())
			.to.be.revertedWithCustomError(sweep, "NotMultisigOrGov");
		await sweep.connect(owner).pause();

		await expect(sweep.connect(owner).transfer(receiver.address, TRANSFER_AMOUNT))
			.to.be.revertedWith("Pausable: paused");
	});

	it('burns Sweeps correctly', async () => {
		MAX_MINT_AMOUNT = toBN("500", 18);
		await sweep.connect(owner).unpause();
		await sweep.connect(owner).setMinterEnabled(newMinter.address, Const.TRUE);
		await sweep.connect(owner).setMinterMaxAmount(newMinter.address, MAX_MINT_AMOUNT);

		expect(await sweep.balanceOf(newMinter.address)).to.equal(Const.ZERO);
		await sweep.connect(newMinter).minterMint(newMinter.address, TRANSFER_AMOUNT);
		await expect(sweep.connect(newMinter).minterMint(newMinter.address, MAX_MINT_AMOUNT))
			.to.be.revertedWithCustomError(sweep, "MintCapReached");

		expect(await sweep.balanceOf(newMinter.address)).to.equal(TRANSFER_AMOUNT);

		await expect(sweep.connect(newMinter).minterBurnFrom(MAX_MINT_AMOUNT))
			.to.be.revertedWithCustomError(sweep, "ExceedBurnAmount");
		await sweep.connect(newMinter).minterBurnFrom(TRANSFER_AMOUNT);
		expect(await sweep.balanceOf(newMinter.address)).to.equal(Const.ZERO);
	});

	it('allow and disallow minting', async () => {
		// Set new arbSpread
		NEW_arbSpread = 0;
		NEW_targetPrice = 1010000;
		await sweep.connect(owner).setBalancer(owner.address);
		await sweep.connect(owner).setArbSpread(NEW_arbSpread);
		await sweep.connect(owner).setTargetPrice(NEW_targetPrice);
		// TODO: change to _amm after new deployment
		await sweep.connect(owner).setAMM(addresses.uniswap_oracle);
		ammPrice = await sweep.ammPrice();

		if (ammPrice >= NEW_targetPrice) { // allow mint
			expect(await sweep.balanceOf(newAddress.address)).to.equal(Const.ZERO);
			await sweep.connect(newMinter).minterMint(newAddress.address, TRANSFER_AMOUNT)
			expect(await sweep.balanceOf(newAddress.address)).to.equal(TRANSFER_AMOUNT);
		} else { // disallow mint
			await expect(sweep.connect(newMinter).minterMint(newAddress.address, TRANSFER_AMOUNT))
				.to.be.revertedWithCustomError(Sweep, 'MintNotAllowed');
		}
	});
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { Const, toBN, getBlockTimestamp } = require("../utils/helper_functions");

contract("Off-Chain Asset - Settings", async function () {
	before(async () => {
		[owner, borrower, wallet, treasury, multisig, lzEndpoint] = await ethers.getSigners();

		sweepAmount = toBN("1000", 18);
		maxBorrow = toBN("100", 18);
		amount = toBN("10", 18);
		usdxAmount = 1000e6;

		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepMock");
		const Proxy = await upgrades.deployProxy(Sweep, [
			lzEndpoint.address,
            owner.address,
            2500 // 0.25%
		]);
		sweep = await Proxy.deployed();

		Token = await ethers.getContractFactory("USDCMock");
		usdx = await Token.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(amm.address);

		OffChainAsset = await ethers.getContractFactory("OffChainAsset");
		offChainAsset = await OffChainAsset.deploy(
			'OffChain Asset',
			sweep.address,
			usdx.address,
			wallet.address,
			Const.ADDRESS_ZERO,
			addresses.oracle_usdc_usd,
			borrower.address
		);

		await offChainAsset.connect(borrower).configure(
			Const.RATIO,
			Const.spreadFee,
			maxBorrow,
			Const.DISCOUNT,
			Const.DAY,
			Const.RATIO,
			maxBorrow,
			Const.TRUE,
			Const.URL
		);

		// usd to the borrower to he can invest
		await usdx.transfer(borrower.address, 50e6);
		await sweep.transfer(borrower.address, maxBorrow);

		// owner/borrower/asset approve stabilizer to spend
		await usdx.approve(offChainAsset.address, usdxAmount);
		await usdx.connect(borrower).approve(offChainAsset.address, usdxAmount);

		// add stabilizer to whitelist
		await sweep.addMinter(offChainAsset.address, maxBorrow);
	});

	describe("settings functions", async function () {
		describe("Use setting manager of stabilizer", async function () {
			it("Set delay and wallet by setting manager of stabilizer", async function () {
				expect(await offChainAsset.settingsEnabled()).to.equal(Const.TRUE);

				await offChainAsset.connect(borrower).setWallet(treasury.address);
				expect(await offChainAsset.wallet()).to.equal(treasury.address);
			});

			it("Reverts when caller is not the borrower", async function () {
				await expect(offChainAsset.connect(treasury).setWallet(wallet.address))
					.to.be.revertedWithCustomError(offChainAsset, 'NotBorrower');

				await expect(offChainAsset.connect(borrower).setWallet(Const.ADDRESS_ZERO))
					.to.be.revertedWithCustomError(offChainAsset, 'ZeroAddressDetected');
			});
		});

		describe("Use collateral agent", async function () {
			it("Update value by collateral agent", async function () {
				// Update value by collateral agent
				sweep_owner = await sweep.owner();
				expect(await offChainAsset.collateralAgency()).to.equal(sweep_owner);
				await expect(offChainAsset.connect(borrower).setCollateralAgent(Const.ADDRESS_ZERO))
					.to.be.revertedWithCustomError(offChainAsset, "ZeroAddressDetected");

				await offChainAsset.connect(borrower).setCollateralAgent(wallet.address);
				expect(await offChainAsset.collateralAgency()).to.equal(wallet.address);

				await offChainAsset.connect(wallet).updateValue(amount);
				timesmtamp = await getBlockTimestamp();

				expect(await offChainAsset.actualValue()).to.equal(amount);
				expect(await offChainAsset.valuationTime()).to.equal(timesmtamp);
			});

			it("Reverts updating value when caller is not collateral agent", async function () {
				// Now, borrower is not collateral agent
				await expect(offChainAsset.connect(borrower).updateValue(amount))
					.to.be.revertedWithCustomError(offChainAsset, 'NotCollateralAgent');
			});
		});
	});
});

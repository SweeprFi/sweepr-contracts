const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { Const, toBN } = require("../utils/helper_functions");

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
            addresses.owner,
            addresses.approver,
            2500 // 0.25%
		]);
		sweep = await Proxy.deployed();

		Token = await ethers.getContractFactory("USDCMock");
		usdx = await Token.deploy();

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, usdOracle.address, Const.ADDRESS_ZERO);

		OffChainAsset = await ethers.getContractFactory("OffChainAsset");
		offChainAsset = await OffChainAsset.deploy(
			'OffChain Asset',
			sweep.address,
			usdx.address,
			wallet.address,
			amm.address,
			borrower.address
		);

		await offChainAsset.connect(borrower).configure(
			Const.RATIO,
			Const.SPREAD_FEE,
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
				expect(await offChainAsset.settings_enabled()).to.equal(Const.TRUE);

				await offChainAsset.connect(borrower).setWallet(treasury.address);
				expect(await offChainAsset.wallet()).to.equal(treasury.address);
			});

			it("Reverts setting when caller is not setting manager", async function () {
				// Change setting manager into multisig
				await offChainAsset.setBorrower(multisig.address);
				expect(await offChainAsset.settings_enabled()).to.equal(Const.TRUE);

				// Now, borrower is not setting manager
				await expect(offChainAsset.connect(borrower).setWallet(wallet.address))
					.to.be.revertedWithCustomError(offChainAsset, 'OnlyBorrower');
			});
		});

		describe("Use collateral agent of Sweep", async function () {
			it("Update value by collateral agent of sweep", async function () {
				// Update value by collateral agent
				await offChainAsset.connect(multisig).setCollateralAgent(borrower.address)
				await offChainAsset.connect(borrower).updateValue(amount);
				expect(await offChainAsset.current_value()).to.equal(amount);
			});

			it("Reverts updating value when caller is not collateral agent", async function () {
				// Now, borrower is not collateral agent
				await expect(offChainAsset.connect(multisig).updateValue(amount))
					.to.be.revertedWithCustomError(offChainAsset, 'OnlyCollateralAgent');
			});
		});
	});
});

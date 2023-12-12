const { expect } = require("chai");
const { ethers } = require("hardhat");
const { tokens, chainlink } = require("../../../utils/constants");
const { Const, toBN, getBlockTimestamp } = require("../../../utils/helper_functions");

contract("Off-Chain Asset - Settings", async function () {
	return;
	before(async () => {
		[owner, borrower, wallet, treasury, multisig, lzEndpoint] = await ethers.getSigners();
		amount = toBN("10", 18);

		OffChainAsset = await ethers.getContractFactory("OffChainAsset");
		offChainAsset = await OffChainAsset.deploy(
			'OffChain Asset',
			tokens.sweep,
			tokens.usdc,
			wallet.address,
			Const.ADDRESS_ZERO,
			chainlink.usdc_usd,
			borrower.address
		);
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

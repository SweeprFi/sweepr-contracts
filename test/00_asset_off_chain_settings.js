const { expect } = require("chai");
const { ethers, contract } = require("hardhat");

contract("Off-Chain Asset - Settings", async function () {
	before(async () => {
		[owner, borrower, wallet, treasury, multisig, lzEndpoint] = await ethers.getSigners();

		sweepAmount = ethers.utils.parseUnits("1000", 18);
		maxBorrow = ethers.utils.parseUnits("100", 18);
		usdxAmount = 1000e6;
		minimumEquityRatio = 1e4; // 1%
		spreadRatio = 1e4; // 1%
		liquidatorDiscount = 2e4; // 2%
		callDelay = 432000; // 5 days
		autoInvestMinEquityRatio = 10e4; // 10%
		autoInvestMinAmount = ethers.utils.parseUnits("10", 18);
		autoInvest = true;
		DELAY = 3; // 3 days

		// ------------- Deployment of contracts -------------
		Sweep = await ethers.getContractFactory("SweepMock");
		const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
		sweep = await Proxy.deployed();

		Token = await ethers.getContractFactory("USDCMock");
		usdx = await Token.deploy();

		Uniswap = await ethers.getContractFactory("UniswapMock");
		amm = await Uniswap.deploy(sweep.address);
		
		USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

		OffChainAsset = await ethers.getContractFactory("OffChainAsset");
		offChainAsset = await OffChainAsset.deploy(
			'OffChain Asset',
			sweep.address,
			usdx.address,
			wallet.address,
			amm.address,
			borrower.address,
			usdOracle.address
		);

		await offChainAsset.connect(borrower).configure(
			minimumEquityRatio,
			spreadRatio,
			maxBorrow,
			liquidatorDiscount,
			callDelay,
			autoInvestMinEquityRatio,
			autoInvestMinAmount,
			autoInvest,
			"htttp://test.com"
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
				expect(await offChainAsset.settings_enabled()).to.equal(true);

				await offChainAsset.connect(borrower).setWallet(treasury.address);
				expect(await offChainAsset.wallet()).to.equal(treasury.address);
			});

			it("Reverts setting when caller is not setting manager", async function () {
				// Change setting manager into multisig
				await offChainAsset.setBorrower(multisig.address);
				expect(await offChainAsset.settings_enabled()).to.equal(true);

				// Now, borrower is not setting manager
				await expect(offChainAsset.connect(borrower).setWallet(wallet.address))
					.to.be.revertedWithCustomError(offChainAsset, 'OnlyBorrower');
			});
		});

		describe("Use collateral agent of Sweep", async function () {
			it("Update value by collateral agent of sweep", async function () {
				// Check to see if collateral agent is set.
				sweep_owner = await sweep.owner();
				expect(await sweep.collateral_agency()).to.equal(sweep_owner);

				// Set collateral agent to borrower
				await sweep.setCollateralAgent(borrower.address);
				expect(await sweep.collateral_agency()).to.equal(borrower.address);

				// Update value by collateral agent
				amount = ethers.utils.parseUnits("10", 18);

				await offChainAsset.connect(borrower).updateValue(amount);
				expect(await offChainAsset.current_value()).to.equal(amount);
			});

			it("Reverts updating value when caller is not collateral agent", async function () {
				// Set collateral agent to wallet
				await sweep.setCollateralAgent(wallet.address);
				expect(await sweep.collateral_agency()).to.equal(wallet.address);

				// Now, borrower is not collateral agent
				amount = ethers.utils.parseUnits("10", 18);

				await expect(
					offChainAsset.connect(borrower).updateValue(
						amount
					)).to.be.revertedWithCustomError(offChainAsset, 'OnlyCollateralAgent');
			});
		});
	});
});

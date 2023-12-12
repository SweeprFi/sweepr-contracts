const { expect } = require("chai");
const { ethers } = require("hardhat");
const { tokens, chainlink, wallets } = require("../../../utils/constants");
const { impersonate, Const, toBN, sendEth, getBlockTimestamp } = require("../../../utils/helper_functions");

contract("Off-Chain Asset", async function (accounts) {
    return;
    before(async () => {
        BORROWER = accounts[0];
        GUEST = accounts[1];
        LZENDPOINT = accounts[2];
        WALLET = accounts[8];

        sweepAmount = toBN("100", 18);
        usdxAmount = 100e6;
        sweepPayback = toBN("50", 18);
        usdxPayback = 50e6;

        // ------------- Deployment of contracts -------------
        sweep = await ethers.getContractAt("SweepCoin", tokens.sweep);
        usdx = await ethers.getContractAt("ERC20", tokens.usdc);

        OffChainAsset = await ethers.getContractFactory("OffChainAsset");
		asset = await OffChainAsset.deploy(
			'OffChain Asset',
			tokens.sweep,
			tokens.usdc,
			WALLET,
			Const.ADDRESS_ZERO,
			chainlink.usdc_usd,
			BORROWER
		);

        OWNER = await sweep.owner();
        await sendEth(OWNER);
        SWEEP_OWNER = await impersonate(OWNER);
        await sweep.connect(SWEEP_OWNER).addMinter(BORROWER, sweepAmount);
        await sweep.mint(sweepAmount);
    });

    describe("main functions", async function () {
        it('deposit usdc and sweep to the asset', async () => {
            user = await impersonate(wallets.usdc_holder);
            await sendEth(user.address);
            await usdx.connect(user).transfer(asset.address, usdxAmount);
            await sweep.transfer(asset.address, sweepAmount);
            expect(await usdx.balanceOf(asset.address)).to.equal(usdxAmount);
            expect(await sweep.balanceOf(asset.address)).to.equal(sweepAmount);
        });

        it("invests correctly", async function () {
            user = await impersonate(GUEST);
            expect(await asset.assetValue()).to.equal(Const.ZERO);
            expect(await asset.valuationTime()).to.equal(Const.ZERO);
            await expect(asset.connect(user).invest(usdxAmount, sweepAmount))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');

            user = await impersonate(BORROWER);
            await asset.connect(user).invest(usdxAmount, sweepAmount);
            timestamp = await getBlockTimestamp();
            expect(await asset.assetValue()).to.above(Const.ZERO);
            expect(await usdx.balanceOf(WALLET)).to.equal(usdxAmount);
            expect(await sweep.balanceOf(WALLET)).to.equal(sweepAmount);
            expect(await asset.valuationTime()).to.equal(timestamp);
        });

        it("divests correctly", async function () {
            user = await impersonate(GUEST);
            await expect(asset.connect(user).divest(usdxAmount))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');

            user = await impersonate(BORROWER);
            await asset.connect(user).divest(usdxPayback);
            expect(await asset.redeemAmount()).to.equal(usdxPayback);
            expect(await asset.redeemMode()).to.equal(Const.TRUE);
            expect(await asset.redeemTime()).to.above(Const.ZERO);
        });

        it("returns investment correctly", async function () {
            user = await impersonate(WALLET);
            await usdx.connect(user).approve(asset.address, usdxPayback);
            await expect(asset.connect(user).payback(tokens.usdt, usdxPayback))
                .to.be.revertedWithCustomError(asset, "InvalidToken");
            await expect(asset.connect(user).payback(tokens.usdc, 10e6))
                .to.be.revertedWithCustomError(asset, "NotEnoughAmount");
            await asset.connect(user).payback(tokens.usdc, usdxPayback);

            expect(await asset.redeemMode()).to.equal(Const.FALSE);
            expect(await asset.redeemAmount()).to.equal(Const.ZERO);

            user = await impersonate(BORROWER);
            await asset.connect(user).divest(usdxPayback);
            expect(await asset.redeemAmount()).to.equal(usdxPayback);
            expect(await asset.redeemMode()).to.equal(Const.TRUE);
            expect(await asset.redeemTime()).to.above(Const.ZERO);

            user = await impersonate(WALLET);
            await sweep.connect(user).approve(asset.address, sweepPayback);
            await asset.connect(user).payback(sweep.address, sweepPayback);

            expect(await asset.redeemMode()).to.equal(Const.FALSE);
            expect(await asset.redeemAmount()).to.equal(Const.ZERO);

        });
    });
});

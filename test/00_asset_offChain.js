const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { impersonate, Const, toBN } = require("../utils/helper_functions");

contract("Off-Chain Asset", async function (accounts) {
    before(async () => {
        GUEST = accounts[0];
        LZENDPOINT = accounts[1];
        WALLET = accounts[8];
        BORROWER = addresses.borrower;

        sweepAmount = toBN("100", 18);
        usdxAmount = 100e6;

        // ------------- Deployment of contracts -------------
        Token = await ethers.getContractFactory("ERC20");
        usdx = await Token.attach(addresses.usdc);

        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [
            LZENDPOINT,
            addresses.owner,
            2500 // 0.25%
        ]);
        sweep = await Proxy.deployed();

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, usdOracle.address, Const.ADDRESS_ZERO);

        OffChainAsset = await ethers.getContractFactory("OffChainAsset");
        asset = await OffChainAsset.deploy(
            'OffChain Asset',
            sweep.address,
            addresses.usdc,
            WALLET,
            amm.address,
            BORROWER
        );
    });

    describe("main functions", async function () {
        it('deposit usdc and sweep to the asset', async () => {
            user = await impersonate(addresses.usdc);
            await usdx.connect(user).transfer(asset.address, usdxAmount);
            await sweep.transfer(asset.address, sweepAmount);
            expect(await usdx.balanceOf(asset.address)).to.equal(usdxAmount);
            expect(await sweep.balanceOf(asset.address)).to.equal(sweepAmount);
        });

        it("invests correctly", async function () {
            user = await impersonate(GUEST);
            expect(await asset.assetValue()).to.equal(Const.ZERO);
            expect(await asset.valuation_time()).to.equal(Const.ZERO);
            await expect(asset.connect(user).invest(usdxAmount, sweepAmount))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');

            user = await impersonate(BORROWER);
            await asset.connect(user).invest(usdxAmount, sweepAmount);
            expect(await asset.assetValue()).to.above(Const.ZERO);
            expect(await usdx.balanceOf(WALLET)).to.equal(usdxAmount);
            expect(await sweep.balanceOf(WALLET)).to.equal(sweepAmount);
        });

        it("divests correctly", async function () {
            user = await impersonate(GUEST);
            await expect(asset.connect(user).divest(usdxAmount))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');

            user = await impersonate(BORROWER);
            await asset.connect(user).divest(usdxAmount);
            expect(await asset.redeem_amount()).to.equal(usdxAmount);
            expect(await asset.redeem_mode()).to.equal(Const.TRUE);
            expect(await asset.redeem_time()).to.above(Const.ZERO);
        });

        it("returns investment correctly", async function () {
            user = await impersonate(WALLET);
            await usdx.connect(user).approve(asset.address, usdxAmount);
            await asset.connect(user).payback(addresses.usdc, usdxAmount);

            expect(await asset.redeem_mode()).to.equal(Const.FALSE);
            expect(await asset.redeem_amount()).to.equal(Const.ZERO);
        });
    });
});

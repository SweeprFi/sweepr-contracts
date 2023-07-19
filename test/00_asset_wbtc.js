const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { impersonate, sendEth, Const, toBN } = require("../utils/helper_functions");

contract("WBTC Asset", async function () {
    before(async () => {
        [borrower, other, treasury, lzEndpoint] = await ethers.getSigners();

        BORROWER = borrower.address;
        depositAmount = 100e6;
        investAmount = 150e6;
        withdrawAmount = 50e6;
        maxSweep = toBN("500000", 18);
        maxBorrow = toBN("1000", 8);

        await sendEth(Const.WBTC_HOLDER);
        // ------------- Deployment of contracts -------------
        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [
            lzEndpoint.address,
            addresses.owner,
            2500 // 0.25%
        ]);
        sweep = await Proxy.deployed();
        user = await impersonate(addresses.owner);
        await sweep.connect(user).setTreasury(addresses.treasury);

        Token = await ethers.getContractFactory("ERC20");
        usdc = await Token.attach(addresses.usdc);
        wbtc = await Token.attach(addresses.wbtc);

        Oracle = await ethers.getContractFactory("AggregatorMock");
        wbtcOracle = await Oracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(amm.address);

        await amm.setPrice(Const.WBTC_AMM);
        await wbtcOracle.setPrice(Const.WBTC_PRICE);

        WBTCAsset = await ethers.getContractFactory("TokenAsset");
        wbtc_asset = await WBTCAsset.deploy(
            'WBTC Asset',
            sweep.address,
            addresses.usdc,
            addresses.wbtc,
            wbtcOracle.address,
            BORROWER
        );

        // simulates a pool in uniswap with 10000 SWEEP/USDX
        await sweep.addMinter(BORROWER, maxSweep);
        await sweep.minterMint(amm.address, maxBorrow);

        user = await impersonate(addresses.usdc)
        await usdc.connect(user).transfer(amm.address, 100e6);

        user = await impersonate(Const.WBTC_HOLDER);
        await wbtc.connect(user).transfer(amm.address, maxBorrow);
    });

    describe("asset constraints", async function () {
        it("only borrower can inveset", async function () {
            await expect(wbtc_asset.connect(other).invest(depositAmount, Const.SLIPPAGE))
                .to.be.revertedWithCustomError(wbtc_asset, 'NotBorrower');
        });

        it("only borrower can divest", async function () {
            await expect(wbtc_asset.connect(other).divest(depositAmount, Const.SLIPPAGE))
                .to.be.revertedWithCustomError(wbtc_asset, 'NotBorrower');
        });
    });

    describe("invest and divest functions", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc);
            await usdc.connect(user).transfer(wbtc_asset.address, depositAmount);
            expect(await usdc.balanceOf(wbtc_asset.address)).to.equal(depositAmount)
        });

        it("invest correctly", async function () {
            expect(await wbtc_asset.assetValue()).to.equal(Const.ZERO);
            await wbtc_asset.invest(investAmount, Const.SLIPPAGE);
            expect(await usdc.balanceOf(wbtc_asset.address)).to.equal(Const.ZERO);
            expect(await wbtc.balanceOf(wbtc_asset.address)).to.greaterThan(Const.ZERO);
        });

        it("divest correctly", async function () {
            await wbtc_asset.divest(withdrawAmount, Const.SLIPPAGE);
            expect(await usdc.balanceOf(wbtc_asset.address)).to.greaterThan(Const.ZERO);
            expect(await wbtc.balanceOf(wbtc_asset.address)).to.greaterThan(Const.ZERO);

            await wbtc_asset.divest(depositAmount, Const.SLIPPAGE);
            expect(await usdc.balanceOf(wbtc_asset.address)).to.greaterThan(Const.ZERO);
            expect(await wbtc.balanceOf(wbtc_asset.address)).to.equal(Const.ZERO);
        });
    });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses, chainId } = require("../utils/address");
const { impersonate, sendEth, resetNetwork, Const, toBN } = require("../utils/helper_functions");

contract("ETS Asset", async function () {
    before(async () => {
        if (Number(chainId) !== 42161) return;

        [borrower, other, treasury, lzEndpoint] = await ethers.getSigners();
        // Variables
        usdxAmount = 5000e6;
        depositAmount = 1000e6;
        withdrawAmount = 500e6;
        investAmount = 500e6;
        daiAmount = toBN("5000", 18);
        maxSweep = toBN("500000", 18);
        sweepAmount = toBN("1000", 18);

        blockNumber = await ethers.provider.getBlockNumber();
        await resetNetwork(Const.BLOCK_NUMBER);
        await sendEth(Const.EXCHANGER_ADMIN);
        await sendEth(addresses.usdc);
        // ------------- Deployment of contracts -------------

        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [
            lzEndpoint.address,
            borrower.address,
            2500 // 0.25%
        ]);
        sweep = await Proxy.deployed();
        await sweep.setTreasury(addresses.treasury);

        Token = await ethers.getContractFactory("ERC20");
        usdc = await Token.attach(addresses.usdc);
        ets = await Token.attach(addresses.ets);

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(amm.address);

        Asset = await ethers.getContractFactory("ETSAsset");
        asset = await Asset.deploy(
            'ETS Asset',
            sweep.address,
            addresses.usdc,
            addresses.ets,
            addresses.ets_exchanger,
            borrower.address
        );

        // add asset as a minter
        await sweep.addMinter(asset.address, maxSweep);

        // remove blockGetter and whitelist the asset
        exchanger = await ethers.getContractAt("IHedgeExchangerMock", addresses.ets_exchanger);
        ROLE = await exchanger.WHITELIST_ROLE();
        user = await impersonate(Const.EXCHANGER_ADMIN);
        await exchanger.connect(user).grantRole(ROLE, asset.address);
    });

    after(async () => {
        await resetNetwork(blockNumber);
    });

    describe("asset constraints", async function () {
        it("only borrower can inveset", async function () {
            await expect(asset.connect(other).invest(depositAmount))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
        });

        it("only borrower can divest", async function () {
            await expect(asset.connect(other).divest(depositAmount))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
        });
    });

    describe("invest and divest functions", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc);
            await usdc.connect(user).transfer(asset.address, depositAmount);
            expect(await usdc.balanceOf(asset.address)).to.equal(depositAmount);
            expect(await asset.currentValue()).to.equal(depositAmount);
        });

        it("invest correctly", async function () {
            expect(await asset.assetValue()).to.equal(Const.ZERO);
            await asset.invest(investAmount);

            expect(await usdc.balanceOf(asset.address)).to.equal(investAmount);
            expect(await ets.balanceOf(asset.address)).to.above(Const.ZERO);
            expect(await asset.assetValue()).to.above(Const.ZERO);

            await asset.invest(depositAmount);
            expect(await usdc.balanceOf(asset.address)).to.equal(Const.ZERO);

            await expect(asset.invest(investAmount))
                .to.be.revertedWithCustomError(asset, "NotEnoughBalance");
        });

        it("divest correctly", async function () {
            const usdcBalance = await usdc.balanceOf(asset.address);
            const etsBalance = await ets.balanceOf(asset.address);
            await asset.divest(withdrawAmount);
            expect(await usdc.balanceOf(asset.address)).to.above(usdcBalance);
            expect(await ets.balanceOf(asset.address)).to.below(etsBalance);

            await asset.divest(withdrawAmount * 2);
            expect(await ets.balanceOf(asset.address)).to.equal(Const.ZERO);
            expect(await asset.assetValue()).to.equal(Const.ZERO);
        });
    });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { wallets, tokens, chainlink, protocols, network, uniswap } = require("../../utils/constants");
const { impersonate, sendEth, increaseTime } = require("../../utils/helper_functions");

contract("Yearn V2 Asset", async function () {
    if (Number(network.id) !== 10) return;

    before(async () => {
        [borrower] = await ethers.getSigners();

        depositAmount = 7000e6;
        investAmount = 7000e6;
        divestAmount = 7000e6;

        Token = await ethers.getContractFactory("ERC20");
        usdc = await Token.attach(tokens.usdc);
        yvMAI = await Token.attach(tokens.yvMAI);

        Asset = await ethers.getContractFactory("YearnV2Asset");
        asset = await Asset.deploy(
            'Yearn V2 Asset',
            tokens.sweep,
            tokens.usdc,
            tokens.dai,
            protocols.yearn.vault,
            protocols.yearn.stake,
            chainlink.usdc_usd,
            borrower.address,
            uniswap.router,
        );

        await sendEth(wallets.usdc_holder);
        const usdHolder = await impersonate(wallets.usdc_holder);
        await usdc.connect(usdHolder).transfer(asset.address, depositAmount);
    });

    describe("yearn asset functions", async function () {
        it("invests into yearn correctly", async function () {
            expect(await asset.assetValue()).to.equal(0);
            expect(await usdc.balanceOf(asset.address)).to.equal(depositAmount);
            await asset.invest(investAmount, 2000);

            const assetValue = await asset.assetValue();
            // give a 4% error margin because of oracles
            expect(assetValue).to.greaterThan(investAmount * 0.98);
            expect(assetValue).to.lessThan(investAmount * 1.02);

            expect(await usdc.balanceOf(asset.address)).to.equal(0);
        });

        it("collects yvMAI rewards", async function () {
            expect(await yvMAI.balanceOf(asset.address)).to.equal(0);

            await increaseTime(86400*365);
            await asset.collect();

            // TODO cannot verify that we will get yvMAI rewards
            // const maiBalance = await yvMAI.balanceOf(asset.address);
            // expect(maiBalance).to.be.greaterThan(0);
        });

        it("divests from yearn correctly", async function () {
            expect(await usdc.balanceOf(asset.address)).to.eq(0);
            expect(await asset.currentValue()).to.equal(await asset.assetValue());
            await asset.divest(divestAmount, 2000);

            expect(await asset.currentValue()).to.be.greaterThan(await asset.assetValue());

            const usdcValue = await usdc.balanceOf(asset.address);

            expect(usdcValue).to.greaterThan(divestAmount * 0.99);
            expect(usdcValue).to.lessThan(divestAmount * 1.01);
        });
    });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { wallets, tokens, chainlink, protocols } = require("../../utils/constants");
const { impersonate, sendEth, toBN, increaseTime } = require("../../utils/helper_functions");

contract("Apollo Asset", async function () {
    before(async () => {
        [borrower] = await ethers.getSigners();

        depositAmount = toBN("7000", 18);
        investAmount = toBN("7000", 18);
        divestAmount = toBN("7000", 18);

        Token = await ethers.getContractFactory("ERC20");
        usdt = await Token.attach(tokens.usdt);

        apollo = await ethers.getContractAt("IApolloX", protocols.apollo.apollo);
        apx = await Token.attach(protocols.apollo.apx);

        ApolloAsset = await ethers.getContractFactory("ApolloAsset");
        apollo_asset = await ApolloAsset.deploy(
            'Apollo Asset',
            tokens.sweep,
            tokens.usdt,
            chainlink.usdt_usd,
            borrower.address,
        );

        await sendEth(wallets.usdt_holder);
        const usdHolder = await impersonate(wallets.usdt_holder);
        await usdt.connect(usdHolder).transfer(apollo_asset.address, depositAmount);
    });

    describe("apollo asset functions", async function () {
        it("invests into apollo correctly", async function () {
            expect(await apollo_asset.assetValue()).to.equal(0);
            expect(await usdt.balanceOf(apollo_asset.address)).to.equal(depositAmount);

            const minAlpOut = investAmount.mul(toBN("98",6)).div(await apollo.alpPrice());
            await apollo_asset.invest(investAmount, minAlpOut);

            const assetValue = await apollo_asset.assetValue();
            expect(assetValue).to.greaterThan(7000e6 * 0.98);

            expect(await usdt.balanceOf(apollo_asset.address)).to.equal(0);
        });

        it("collects APX rewards", async function () {
            await increaseTime(259200);

            expect(await apx.balanceOf(apollo_asset.address)).to.equal(0);

            await apollo_asset.collect();

            const apxBalance = await apx.balanceOf(apollo_asset.address);
            expect(apxBalance).to.be.greaterThan(0);
        });

        it("divests by reedeming the staked tokens and exiting the pool", async function () {
            expect(await usdt.balanceOf(apollo_asset.address)).to.eq(0);
            expect(await apollo_asset.currentValue()).to.equal(await apollo_asset.assetValue());
        
            const minUsdtOut = toBN("6800", 18);
            const alpAmount = toBN("99999", 18); // big int value
            await apollo_asset.divest(alpAmount, minUsdtOut);

            expect(await apollo_asset.currentValue()).to.be.greaterThan(await apollo_asset.assetValue());

            const usdtValue = await usdt.balanceOf(apollo_asset.address);
            expect(usdtValue).to.greaterThan(minUsdtOut);
        });
    });
});

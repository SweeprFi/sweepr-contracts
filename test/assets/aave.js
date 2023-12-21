const { expect } = require("chai");
const { ethers } = require("hardhat");
const { wallets, tokens, chainlink, protocols } = require("../../utils/constants");
const { impersonate, sendEth } = require("../../utils/helper_functions");

contract("Aave Asset", async function () {
    before(async () => {
        [borrower] = await ethers.getSigners();

        amount = 7000e6;

        Token = await ethers.getContractFactory("ERC20");
        usdc = await Token.attach(tokens.usdc);

        Asset = await ethers.getContractFactory("AaveAsset");
        asset = await Asset.deploy(
            'Aave Asset',
            tokens.sweep,
            tokens.usdc,
            tokens.usdc_e,
            protocols.balancer.bpt_4pool,
            protocols.aave.usdc,
            protocols.aave.pool,
            chainlink.usdc_usd,
            borrower.address,
        );

        await sendEth(wallets.usdc_holder);
        const usdHolder = await impersonate(wallets.usdc_holder);
        await usdc.connect(usdHolder).transfer(asset.address, amount);
    });

    describe("aave asset functions", async function () {
        it("invests into aave correctly", async function () {
            expect(await asset.assetValue()).to.equal(0);
            expect(await usdc.balanceOf(asset.address)).to.equal(amount);

            await asset.invest(amount, 2000);

            const assetValue = await asset.assetValue();

            // give a 4% error margin because of oracles
            expect(assetValue).to.greaterThan(amount * 0.98);
            expect(assetValue).to.lessThan(amount * 1.02);

            expect(await usdc.balanceOf(asset.address)).to.equal(0);
        });

        it("divests from aave correctly", async function () {
            expect(await usdc.balanceOf(asset.address)).to.eq(0);
            expect(await asset.currentValue()).to.equal(await asset.assetValue());
        
            await asset.divest(amount, 20000);

            expect(await asset.currentValue()).to.be.greaterThan(await asset.assetValue());

            const usdcValue = await usdc.balanceOf(asset.address);
            // give a 4% error margin because of oracles
            expect(usdcValue).to.greaterThan(amount * 0.98);
            expect(usdcValue).to.lessThan(amount * 1.02);    
        });
    });
});

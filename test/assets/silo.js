const { expect } = require("chai");
const { ethers } = require("hardhat");
const { wallets, tokens, chainlink, protocols } = require("../../utils/constants");
const { impersonate, sendEth, increaseTime, Const } = require("../../utils/helper_functions");

contract("Silo Asset", async function () {
    before(async () => {
        [borrower] = await ethers.getSigners();

        depositAmount = 7000e6;
        investAmount = 7000e6;
        divestAmount = 7000e6;

        Token = await ethers.getContractFactory("ERC20");
        usdc = await Token.attach(tokens.usdc);
        arb = await Token.attach(tokens.arb);
        silo = await Token.attach(protocols.silo.silo);
        lens = await Token.attach(protocols.silo.lens);

        SiloAsset = await ethers.getContractFactory("SiloAsset");
        silo_asset = await SiloAsset.deploy(
            'Silo Asset',
            tokens.sweep,
            tokens.usdc,
            tokens.usdc_e,
            silo.address,
            lens.address,
            chainlink.usdc_usd,
            borrower.address,
            protocols.balancer.bpt_4pool
        );

        await sendEth(wallets.usdc_holder);
        const usdHolder = await impersonate(wallets.usdc_holder);
        await usdc.connect(usdHolder).transfer(silo_asset.address, depositAmount);
    });

    describe("silo asset functions", async function () {
        it("invests into silo correctly", async function () {
            expect(await silo_asset.assetValue()).to.equal(0);
            expect(await usdc.balanceOf(silo_asset.address)).to.equal(depositAmount);

            await silo_asset.invest(investAmount, 2000);

            const assetValue = await silo_asset.assetValue();

            // give a 4% error margin because of oracles
            expect(assetValue).to.greaterThan(investAmount * 0.98);
            expect(assetValue).to.lessThan(investAmount * 1.02);

            expect(await usdc.balanceOf(silo_asset.address)).to.equal(0);
        });

        it.skip("collects arb rewards", async function () {
            expect(await arb.balanceOf(silo_asset.address)).to.equal(0);            
            await increaseTime(Const.DAY*365);

            await silo_asset.collect();

            const arbBalance = await arb.balanceOf(silo_asset.address);
            expect(arbBalance).to.be.greaterThan(0);
        });

        it("divests by reedeming the staked tokens and exiting the pool", async function () {
            expect(await usdc.balanceOf(silo_asset.address)).to.eq(0);
            expect(await silo_asset.currentValue()).to.equal(await silo_asset.assetValue());
        
            await silo_asset.divest(divestAmount, 20000);

            expect(await silo_asset.currentValue()).to.be.greaterThan(await silo_asset.assetValue());

            const usdcValue = await usdc.balanceOf(silo_asset.address);
            // give a 4% error margin because of oracles
            expect(usdcValue).to.greaterThan(divestAmount * 0.98);
            expect(usdcValue).to.lessThan(divestAmount * 1.02);    
        });
    });
});

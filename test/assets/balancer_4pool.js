const { expect } = require("chai");
const { ethers } = require("hardhat");
const { wallets, tokens, chainlink, protocols } = require("../../utils/constants");
const { impersonate, sendEth, increaseTime, Const } = require("../../utils/helper_functions");

contract.only("Balancer Asset", async function () {
    before(async () => {
        [borrower] = await ethers.getSigners();

        depositAmount = 7000e6;
        investAmount = 7000e6;
        divestAmount = 7000e6;

        Token = await ethers.getContractFactory("ERC20");
        usdc = await Token.attach(tokens.usdc);
        arb = await Token.attach(tokens.arb);
        pool = await Token.attach(protocols.balancer.bpt_4pool);
        gauge = await Token.attach(protocols.balancer.gauge_4pool);

        BalancerAsset = await ethers.getContractFactory("Balancer4PoolAsset");
        balancer_asset = await BalancerAsset.deploy(
            'Balancer 4 Pool Asset',
            tokens.sweep,
            tokens.usdc,
            pool.address,
            gauge.address,
            chainlink.usdc_usd,
            borrower.address
        );

        await sendEth(wallets.usdc_holder);
        const usdHolder = await impersonate(wallets.usdc_holder);
        await usdc.connect(usdHolder).transfer(balancer_asset.address, depositAmount);
    });

    describe("balancer asset functions", async function () {
        it("invests by joining the pool and staking into the gauge", async function () {
            expect(await balancer_asset.assetValue()).to.equal(0);
            expect(await usdc.balanceOf(balancer_asset.address)).to.equal(depositAmount);
            expect(await gauge.balanceOf(balancer_asset.address)).to.equal(0);

            await balancer_asset.invest(investAmount, 2000);

            const assetValue = await balancer_asset.assetValue();

            // give a 4% error margin because of oracles
            expect(assetValue).to.greaterThan(investAmount * 0.98);
            expect(assetValue).to.lessThan(investAmount * 1.02);

            expect(await gauge.balanceOf(balancer_asset.address)).to.be.greaterThan(0);
        });

        it("collects arb rewards", async function () {
            expect(await arb.balanceOf(balancer_asset.address)).to.equal(0);
            await increaseTime(Const.DAY*365);

            await balancer_asset.collect();

            const arbBalance = await arb.balanceOf(balancer_asset.address);
            expect(arbBalance).to.be.greaterThan(0);
        });

        it("divests by reedeming the staked tokens and exiting the pool", async function () {
            expect(await usdc.balanceOf(balancer_asset.address)).to.eq(0);
            expect(await balancer_asset.currentValue()).to.equal(await balancer_asset.assetValue());
        
            await balancer_asset.divest(divestAmount, 20000);

            expect(await balancer_asset.currentValue()).to.be.greaterThan(await balancer_asset.assetValue());

            const usdcValue = await usdc.balanceOf(balancer_asset.address);
            // give a 4% error margin because of oracles
            expect(usdcValue).to.greaterThan(divestAmount * 0.98);
            expect(usdcValue).to.lessThan(divestAmount * 1.02);    
        });
    });
});

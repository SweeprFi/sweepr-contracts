const { expect } = require("chai");
const { ethers } = require("hardhat");
const { wallets, tokens, chainlink, protocols, network, uniswap } = require("../../utils/constants");
const { impersonate, sendEth } = require("../../utils/helper_functions");

contract.only("Aura Asset", async function () {
    if (Number(network.id) !== 8453) return;

    before(async () => {
        [borrower] = await ethers.getSigners();

        depositAmount = 7000e6;
        investAmount = 7000e6;
        divestAmount = 7000e6;

        Token = await ethers.getContractFactory("ERC20");
        usdc = await Token.attach(tokens.usdc);

        const depositor = protocols.aura.rewardPoolDepositWapper;
        const shares = protocols.aura.baseRewardPool4626;
        const pool = protocols.aura.balancerPool;
        const quoter = protocols.aura.quoter;

        Asset = await ethers.getContractFactory("AuraAsset");
        asset = await Asset.deploy(
            'Aura Asset',
            tokens.sweep,
            tokens.usdc,
            depositor,
            shares,
            pool,
            quoter,
            chainlink.usdc_usd,
            borrower.address,
        );

        await sendEth(wallets.usdc_holder);
        const usdHolder = await impersonate(wallets.usdc_holder);
        await usdc.connect(usdHolder).transfer(asset.address, depositAmount);
    });

    describe("aura asset functions", async function () {
        it("invests into aura correctly", async function () {
            assetValue = Number(await ethers.provider.send("eth_call", [
                {
                  from: borrower.address,
                  to: asset.address,
                  data: "0xa71891c3",
                },
                "latest",
            ]));

            expect(assetValue).to.equal(0);
            expect(await usdc.balanceOf(asset.address)).to.equal(depositAmount);

            await asset.invest(investAmount, 2000);
            
            assetValue = Number(await ethers.provider.send("eth_call", [
                {
                  from: borrower.address,
                  to: asset.address,
                  data: "0xa71891c3",
                },
                "latest",
            ]));
            
            console.log("assetValue:", assetValue);

            expect(assetValue).to.greaterThan(investAmount * 0.98);
            expect(assetValue).to.lessThan(investAmount * 1.02);
            expect(await usdc.balanceOf(asset.address)).to.equal(0);
        });

        it("divests from aura correctly", async function () {
            expect(await usdc.balanceOf(asset.address)).to.eq(0);
            
            assetValue = Number(await ethers.provider.send("eth_call", [
                {
                  from: borrower.address,
                  to: asset.address,
                  data: "0xa71891c3",
                },
                "latest",
            ]));

            currentValue = Number(await ethers.provider.send("eth_call", [
                {
                  from: borrower.address,
                  to: asset.address,
                  data: "0x698996f8",
                },
                "latest",
            ]));
            
            expect(currentValue).to.equal(assetValue);
            await asset.divest(divestAmount, 2000);

            assetValue = Number(await ethers.provider.send("eth_call", [
                {
                  from: borrower.address,
                  to: asset.address,
                  data: "0xa71891c3",
                },
                "latest",
            ]));

            currentValue = Number(await ethers.provider.send("eth_call", [
                {
                  from: borrower.address,
                  to: asset.address,
                  data: "0x698996f8",
                },
                "latest",
            ]));

            expect(currentValue).to.be.greaterThan(assetValue);

            const usdcValue = await usdc.balanceOf(asset.address);

            expect(usdcValue).to.greaterThan(divestAmount * 0.99);
            expect(usdcValue).to.lessThan(divestAmount * 1.01);
        });
    });
});

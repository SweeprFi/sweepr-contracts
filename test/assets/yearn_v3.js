const { expect } = require("chai");
const { ethers } = require("hardhat");
const { wallets, tokens, chainlink, protocols, network, uniswap } = require("../../utils/constants");
const { impersonate, sendEth } = require("../../utils/helper_functions");

contract.only("Yearn V3 Asset", async function () {
    if (Number(network.id) !== 137) return;

    before(async () => {
        [borrower] = await ethers.getSigners();

        depositAmount = 7000e6;
        investAmount = 7000e6;
        divestAmount = 7000e6;

        Token = await ethers.getContractFactory("ERC20");
        usdc = await Token.attach(tokens.usdc);

        Asset = await ethers.getContractFactory("YearnV3Asset");
        asset = await Asset.deploy(
            'Yearn V3 Asset',
            tokens.sweep,
            tokens.usdc,
            tokens.usdc_e,
            protocols.yearn.vault,
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

        it("divests from yearn correctly", async function () {
            expect(await usdc.balanceOf(asset.address)).to.eq(0);
            expect(await asset.currentValue()).to.equal(await asset.assetValue());
            await asset.divest(divestAmount, 20000);

            expect(await asset.currentValue()).to.be.greaterThan(await asset.assetValue());

            const usdcValue = await usdc.balanceOf(asset.address);

            expect(usdcValue).to.greaterThan(divestAmount * 0.99);
            expect(usdcValue).to.lessThan(divestAmount * 1.01);
        });
    });
});

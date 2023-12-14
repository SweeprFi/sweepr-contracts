const { ethers } = require('hardhat');
const { expect } = require("chai");
const { impersonate, Const, sendEth, increaseTime } = require("../../../utils/helper_functions")
const { network, tokens, chainlink, uniswap, protocols, wallets } = require("../../../utils/constants");

contract('DSR Asset', async () => {
    if (Number(network.id) !== 1) return;

    before(async () => {
        [borrower, other, lzEndpoint] = await ethers.getSigners();

        depositAmount = 200e6;
        sweep = await ethers.getContractAt("SweepCoin", tokens.sweep);
        ERC20 = await ethers.getContractFactory("ERC20");
        usdx = await ERC20.attach(tokens.usdc);
        dai = await ERC20.attach(tokens.dai);
        sDai = await ERC20.attach(protocols.maker.sdai);

        Asset = await ethers.getContractFactory("DsrAsset");
        asset = await Asset.deploy(
            'DSR Asset',
            tokens.sweep,
            tokens.usdc,
            tokens.dai,
            protocols.maker.sdai,
            protocols.maker.psm,
            chainlink.usdc_usd,
            chainlink.dai_usd,
            borrower.address
        );

        HOLDER = await impersonate(wallets.usdc_holder);
        await sendEth(HOLDER.address);
        await usdx.connect(HOLDER).transfer(asset.address, depositAmount);
    });

    describe("sDai/Spark protocol", async function () {
        it('invests correctly', async () => {
            await expect(asset.connect(other).invest(depositAmount, 5000))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');

            expect(await asset.assetValue()).to.equal(0);
            await asset.invest(depositAmount, 5000);
            expect(await asset.assetValue()).to.be.greaterThan(depositAmount * 0.98);
            expect(await asset.assetValue()).to.be.lessThan(depositAmount * 1.02);

            await expect(asset.invest(depositAmount, 5000))
                .to.be.revertedWithCustomError(asset, "NotEnoughBalance");
        });

        it('divests correctly', async () => {
            await expect(asset.connect(other).divest(depositAmount, 0))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');

            await asset.divest(depositAmount, Const.SLIPPAGE);

            expect(await asset.assetValue()).to.eq(0);

            expect(await asset.currentValue()).to.be.greaterThan(depositAmount * 0.98);
            expect(await asset.currentValue()).to.be.lessThan(depositAmount * 1.02);
        });
    });
});

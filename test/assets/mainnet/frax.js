const { ethers } = require('hardhat');
const { expect } = require("chai");
const { impersonate, Const, sendEth } = require("../../../utils/helper_functions");
const { network, tokens, chainlink, uniswap, wallets } = require("../../../utils/constants");

contract('sFrax Asset', async () => {
    if (Number(network.id) !== 1) return;

    before(async () => {
        [owner, lzEndpoint] = await ethers.getSigners();

        depositAmount = 10000e6;
        investAmount = 6000e6;
        divestAmount = 12000e6;

        sweep = await ethers.getContractAt("SweepCoin", tokens.sweep);
        usdx = await ethers.getContractAt("ERC20", tokens.usdc);
        sFrax = await ethers.getContractAt("IERC4626", tokens.sfrax);

        LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
        liquidityHelper = await LiquidityHelper.deploy();

        Uniswap = await ethers.getContractFactory("UniswapAMM");
        amm = await Uniswap.deploy(
            tokens.sweep,
            tokens.usdc,
            chainlink.sequencer,
            uniswap.pool_sweep,
            chainlink.usdc_usd,
            86400,
            liquidityHelper.address,
            uniswap.router
        );

        Asset = await ethers.getContractFactory("SFraxAsset");
        asset = await Asset.deploy(
            "sFrax Asset",
            tokens.sweep,
            tokens.usdc,
            tokens.frax,
            tokens.sfrax,
            chainlink.usdc_usd,
            chainlink.frax_usd,
            owner.address,
            uniswap.pool_frax
        );

        OWNER = await sweep.owner();
        await sendEth(OWNER);
        SWEEP_OWNER = await impersonate(OWNER);
        await sweep.connect(SWEEP_OWNER).setAMM(amm.address);

        HOLDER = await impersonate(wallets.usdc_holder);
        await sendEth(HOLDER.address);
        await usdx.connect(HOLDER).transfer(asset.address, depositAmount);
    });

    describe("Initial Test", async function () {
        it('invest into sFrax', async () => {
            await asset.invest(investAmount, Const.SLIPPAGE);
            expect(await asset.assetValue()).to.above(Const.ZERO);
            expect(await sFrax.balanceOf(asset.address)).to.be.above(0);

            await asset.invest(investAmount, Const.SLIPPAGE);

            await expect(asset.invest(investAmount, Const.SLIPPAGE))
                .to.be.revertedWithCustomError(asset, "NotEnoughBalance");
        });

        it('divest from sFrax', async () => {
            await asset.divest(divestAmount, Const.SLIPPAGE);
            expect(await usdx.balanceOf(asset.address)).to.be.above(depositAmount * 0,95);
        });
    });
});

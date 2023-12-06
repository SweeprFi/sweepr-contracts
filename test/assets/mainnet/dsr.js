const { ethers } = require('hardhat');
const { expect } = require("chai");
const { impersonate, Const, sendEth, increaseTime } = require("../../../utils/helper_functions")
const { network, tokens, chainlink, uniswap, protocols, wallets } = require("../../../utils/constants");

contract('DSR Asset', async () => {
    if (Number(network.id) !== 1) return;

    before(async () => {
        [borrower, other, lzEndpoint] = await ethers.getSigners();

        depositAmount = 200e6;
        investAmount = 100e6;
        divestAmount = 50e6;

        sweep = await ethers.getContractAt("SweepCoin", tokens.sweep);
        ERC20 = await ethers.getContractFactory("ERC20");
        usdx = await ERC20.attach(tokens.usdc);
        dai = await ERC20.attach(tokens.dai);

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
            liquidityHelper.address
        );
        
        Asset = await ethers.getContractFactory("DsrAsset");
        asset = await Asset.deploy(
            'DSR Asset',
            tokens.sweep,
            tokens.usdc,
            tokens.dai,
            protocols.dsr_manager,
            protocols.dss_psm,
            chainlink.usdc_usd,
            chainlink.dai_usd,
            borrower.address
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
        it('invest to the DSR', async () => {
            await expect(asset.connect(other).invest(depositAmount, 0))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');

            expect(await asset.assetValue()).to.equal(Const.ZERO);
            await asset.invest(investAmount, Const.SLIPPAGE);
            expect(await asset.assetValue()).to.above(Const.ZERO);

            await asset.invest(depositAmount, Const.SLIPPAGE);
            await expect(asset.invest(depositAmount, 0))
                .to.be.revertedWithCustomError(asset, "NotEnoughBalance");
        });

        it('divest to the DSR', async () => {
            assetVal = await asset.assetValue();
            
            // Delay 5 days
            await increaseTime(Const.DAY * 5);
            
            await asset.dsrDaiBalance();
            expect(await asset.assetValue()).to.above(assetVal);

            // Divest usdx
            await expect(asset.connect(other).divest(divestAmount, 0))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
            await asset.divest(divestAmount, Const.SLIPPAGE);
            expect(await asset.assetValue()).to.above(Const.ZERO);
            
            divestAmount = 250e6;
            await asset.divest(divestAmount, Const.SLIPPAGE);
            expect(await asset.assetValue()).to.equal(Const.ZERO);
        });
    });
});

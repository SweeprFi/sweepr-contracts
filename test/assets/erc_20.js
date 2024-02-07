const { expect } = require("chai");
const { ethers } = require("hardhat");
const { tokens, chainlink, uniswap, wallets } = require("../../utils/constants");
const { impersonate, sendEth, Const, toBN } = require("../../utils/helper_functions");
let user;

contract("ERC20 Asset (WETH)", async function () {
    before(async () => {
        [borrower, other, treasury, lzEndpoint] = await ethers.getSigners();

        BORROWER = borrower.address;
        depositAmount = 10e6;
        withdrawAmount = 15e6;
        maxSweep = toBN("500000", 18);
        maxBorrow = toBN("100", 18);

        await sendEth(Const.WETH_HOLDER);
        // ------------- Deployment of contracts -------------
        sweep = await ethers.getContractAt("SweepCoin", tokens.sweep);
        Token = await ethers.getContractFactory("ERC20");
        usdc = await Token.attach(tokens.usdc);
        weth = await Token.attach(tokens.weth);

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

        WETHAsset = await ethers.getContractFactory("ERC20Asset");
        weth_asset = await WETHAsset.deploy(
            'WETH Asset',
            tokens.sweep,
            tokens.usdc,
            tokens.weth,
			chainlink.usdc_usd,
            chainlink.weth_usd,
            BORROWER,
            uniswap.pool_weth
        );

        OWNER = await sweep.owner();
        await sendEth(OWNER);
        SWEEP_OWNER = await impersonate(OWNER);
        await sweep.connect(SWEEP_OWNER).setAMM(amm.address);
    });

    describe("asset constraints", async function () {
        it("only borrower can inveset", async function () {
            await expect(weth_asset.connect(other).invest(depositAmount, Const.SLIPPAGE))
                .to.be.revertedWithCustomError(weth_asset, 'NotBorrower');
        });

        it("only borrower can divest", async function () {
            await expect(weth_asset.connect(other).divest(depositAmount, Const.SLIPPAGE))
                .to.be.revertedWithCustomError(weth_asset, 'NotBorrower');
        });
    });

    describe("invest and divest functions", async function () {
        it("invest correctly", async function () {
            await sendEth(wallets.usdc_holder);
            user = await impersonate(wallets.usdc_holder);
            await usdc.connect(user).transfer(weth_asset.address, depositAmount);

            expect(await weth_asset.assetValue()).to.equal(Const.ZERO);
            await weth_asset.invest(depositAmount, Const.SLIPPAGE);
            expect(await usdc.balanceOf(weth_asset.address)).to.equal(Const.ZERO);
            expect(await weth.balanceOf(weth_asset.address)).to.above(Const.ZERO);

            await expect(weth_asset.invest(depositAmount, Const.SLIPPAGE))
                .to.be.revertedWithCustomError(weth_asset, "NotEnoughBalance");
        });

        it("divest correctly", async function () {
            await weth_asset.divest(withdrawAmount, Const.SLIPPAGE);
            expect(await usdc.balanceOf(weth_asset.address)).to.above(Const.ZERO);
            expect(await weth.balanceOf(weth_asset.address)).to.equal(Const.ZERO);
        });
    });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { impersonate, sendEth, Const, toBN } = require("../utils/helper_functions");
let user;

contract("WETH Asset", async function () {
    before(async () => {
        [borrower, other, treasury, lzEndpoint] = await ethers.getSigners();

        BORROWER = borrower.address;
        depositAmount = 10e6;
        withdrawAmount = 15e6;
        maxSweep = toBN("500000", 18);
        maxBorrow = toBN("100", 18);

        await sendEth(Const.WETH_HOLDER);
        // ------------- Deployment of contracts -------------
        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [
            lzEndpoint.address,
            addresses.owner,
            2500 // 0.25%
        ]);
        sweep = await Proxy.deployed();
        user = await impersonate(addresses.owner);
        await sweep.connect(user).setTreasury(addresses.treasury);

        Token = await ethers.getContractFactory("ERC20");
        usdc = await Token.attach(addresses.usdc);
        weth = await Token.attach(addresses.weth);

        Oracle = await ethers.getContractFactory("AggregatorMock");
        wethOracle = await Oracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(amm.address);

        await amm.setPrice(Const.WETH_AMM);
        await wethOracle.setPrice(Const.WETH_PRICE);

        WETHAsset = await ethers.getContractFactory("TokenAsset");
        weth_asset = await WETHAsset.deploy(
            'WETH Asset',
            sweep.address,
            addresses.usdc,
            addresses.weth,
			addresses.oracle_usdc_usd,
            wethOracle.address,
            BORROWER,
            Const.FEE
        );

        // simulates a pool in uniswap with 10000 SWEEP/USDX
        await sweep.addMinter(BORROWER, maxSweep);
        user = await impersonate(BORROWER);
        await sweep.connect(user).mint(maxBorrow);
        await sweep.connect(user).transfer(amm.address, maxBorrow);

        user = await impersonate(addresses.usdc_holder);
        await sendEth(user.address);
        await usdc.connect(user).transfer(amm.address, 100e6);

        user = await impersonate(Const.WETH_HOLDER);
        await weth.connect(user).transfer(amm.address, maxBorrow);
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
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc_holder);
            await usdc.connect(user).transfer(weth_asset.address, depositAmount);
            expect(await usdc.balanceOf(weth_asset.address)).to.equal(depositAmount)
        });

        it("invest correctly", async function () {
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

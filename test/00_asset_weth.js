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
        usdOracle = await Oracle.deploy();
        wethOracle = await Oracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, usdOracle.address, Const.ADDRESS_ZERO);
        await amm.setPrice(Const.WETH_PRICE);
        await wethOracle.setPrice(Const.WETH_PRICE);

        WETHAsset = await ethers.getContractFactory("TokenAsset");
        weth_asset = await WETHAsset.deploy(
            'WETH Asset',
            sweep.address,
            addresses.usdc,
            addresses.weth,
            wethOracle.address,
            amm.address,
            BORROWER
        );

        // simulates a pool in uniswap with 10000 SWEEP/USDX
        await sweep.addMinter(BORROWER, maxSweep);
        await sweep.minter_mint(amm.address, maxBorrow);

        user = await impersonate(addresses.usdc)
        await usdc.connect(user).transfer(amm.address, 100e6);

        user = await impersonate(Const.WETH_HOLDER);
        await weth.connect(user).transfer(amm.address, maxBorrow);
    });

    describe("asset constraints", async function () {
        it("only borrower can inveset", async function () {
            await expect(weth_asset.connect(other).invest(depositAmount))
                .to.be.revertedWithCustomError(weth_asset, 'NotBorrower');
        });

        it("only borrower can divest", async function () {
            await expect(weth_asset.connect(other).divest(depositAmount))
                .to.be.revertedWithCustomError(weth_asset, 'NotBorrower');
        });
    });

    describe("invest and divest functions", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc);
            await usdc.connect(user).transfer(weth_asset.address, depositAmount);
            expect(await usdc.balanceOf(weth_asset.address)).to.equal(depositAmount)
        });

        it("invest correctly", async function () {
            expect(await weth_asset.assetValue()).to.equal(Const.ZERO);
            await weth_asset.invest(depositAmount);
            expect(await usdc.balanceOf(weth_asset.address)).to.equal(Const.ZERO);
            expect(await weth.balanceOf(weth_asset.address)).to.above(Const.ZERO);
        });

        it("divest correctly", async function () {
            await weth_asset.divest(withdrawAmount);
            expect(await usdc.balanceOf(weth_asset.address)).to.above(Const.ZERO);
            expect(await weth.balanceOf(weth_asset.address)).to.equal(Const.ZERO);
        });
    });
});

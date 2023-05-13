const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { impersonate, sendEth } = require("../utils/helper_functions");
let user;

contract("WETH Asset - Local", async function () {
    before(async () => {
        [borrower, other, treasury, lzEndpoint] = await ethers.getSigners();
        depositAmount = 10e6;
        withdrawAmount = 15e6;
        ZERO = 0;
        BORROWER = borrower.address;
        maxSweep = ethers.utils.parseUnits("500000", 18);
        maxBorrow = ethers.utils.parseUnits("100", 18);
        WETH_HOLDER = '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8';
        ADDRESS_ZERO = ethers.constants.AddressZero;

        await sendEth(WETH_HOLDER);
        // ------------- Deployment of contracts -------------
        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
        sweep = await Proxy.deployed();
        await sweep.setTreasury(treasury.address);

        Token = await ethers.getContractFactory("ERC20");
        usdc = await Token.attach(addresses.usdc);
        weth = await Token.attach(addresses.weth);

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, usdOracle.address, ADDRESS_ZERO);
        await amm.setPrice(1900e6);

        WETHAsset = await ethers.getContractFactory("TokenAsset");
        weth_asset = await WETHAsset.deploy(
            'WETH Asset',
            sweep.address,
            addresses.usdc,
            addresses.weth,
            addresses.oracle_weth_usd,
            amm.address,
            BORROWER
        );

        // simulates a pool in uniswap with 10000 SWEEP/USDX
        await sweep.addMinter(BORROWER, maxSweep);
        await sweep.minter_mint(amm.address, maxBorrow);

        user = await impersonate(addresses.usdc)
        await usdc.connect(user).transfer(amm.address, 100e6);

        user = await impersonate(WETH_HOLDER);
        await weth.connect(user).transfer(amm.address, maxBorrow);
    });

    describe("asset constraints", async function () {
        it("only borrower can inveset", async function () {
            await expect(weth_asset.connect(other).invest(depositAmount))
                .to.be.revertedWithCustomError(weth_asset, 'OnlyBorrower');
        });

        it("only borrower can divest", async function () {
            await expect(weth_asset.connect(other).divest(depositAmount))
                .to.be.revertedWithCustomError(weth_asset, 'OnlyBorrower');
        });
    });

    describe("invest and divest functions", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc);
            await usdc.connect(user).transfer(weth_asset.address, depositAmount);
            expect(await usdc.balanceOf(weth_asset.address)).to.equal(depositAmount)
        });

        it("invest correctly", async function () {
            expect(await weth_asset.assetValue()).to.equal(ZERO);
            await weth_asset.invest(depositAmount);
            expect(await usdc.balanceOf(weth_asset.address)).to.equal(ZERO);
            expect(await weth.balanceOf(weth_asset.address)).to.above(ZERO);
        });

        it("divest correctly", async function () {
            await weth_asset.divest(withdrawAmount);
            expect(await usdc.balanceOf(weth_asset.address)).to.above(ZERO);
            expect(await weth.balanceOf(weth_asset.address)).to.equal(ZERO);
        });
    });
});

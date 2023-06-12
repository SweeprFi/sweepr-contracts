const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses, chainId } = require("../utils/address");
const { impersonate, sendEth, increaseTime, Const, toBN } = require("../utils/helper_functions");

contract("USDPlus Asset", async function () {
    before(async () => {
        if (Number(chainId) !== 42161) return;
        
        [borrower, other, treasury, lzEndpoint] = await ethers.getSigners();
        // Variables
        usdxAmount = 5000e6;
        depositAmount = 1000e6;
        withdrawAmount = 1000e6;
        daiAmount = toBN("5000", 18);
        maxSweep = toBN("500000", 18);
        sweepAmount = toBN("1000", 18);

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
        usdPlus = await Token.attach(addresses.usdPlus);

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(amm.address);

        Asset = await ethers.getContractFactory("USDPlusAsset");
        asset = await Asset.deploy(
            'USDPlus Asset',
            sweep.address,
            addresses.usdc,
            addresses.usdPlus,
            addresses.usdPlus_exchanger,
            borrower.address
        );

        // add asset as a minter
        await sweep.addMinter(asset.address, maxSweep);
    });

    describe("asset constraints", async function () {
        it("only borrower can inveset", async function () {
            await expect(asset.connect(other).invest(depositAmount))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
        });

        it("only borrower can divest", async function () {
            await expect(asset.connect(other).divest(depositAmount))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
        });
    });

    describe("invest and divest functions", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc);
            await usdc.connect(user).transfer(asset.address, depositAmount);
            expect(await usdc.balanceOf(asset.address)).to.equal(depositAmount)
        });

        it("invest correctly", async function () {
            expect(await asset.assetValue()).to.equal(Const.ZERO);
            await asset.invest(depositAmount);
            expect(await usdc.balanceOf(asset.address)).to.equal(Const.ZERO);
            expect(await usdPlus.balanceOf(asset.address)).to.above(Const.ZERO);
        });

        // it("divest correctly", async function () {
        //     const usdcBalance = await usdc.balanceOf(asset.address);
        //     const usdPlusBalance = await usdPlus.balanceOf(asset.address);
        //     await asset.divest(withdrawAmount);
        //     expect(await usdc.balanceOf(asset.address)).to.above(usdcBalance);
        //     expect(await usdPlus.balanceOf(asset.address)).to.below(usdPlusBalance);
        // });
    });
});

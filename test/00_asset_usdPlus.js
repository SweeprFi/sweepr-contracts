const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses, chainId } = require("../utils/address");
const { impersonate, Const, toBN, resetNetwork, sendEth } = require("../utils/helper_functions");

contract("USDPlus Asset", async function () {
    before(async () => {
        if (Number(chainId) !== 42161) return;
        
        [borrower, other, treasury, lzEndpoint] = await ethers.getSigners();
        // Variables
        usdxAmount = 5000e6;
        depositAmount = 1000e6;
        investAmount = 600e6;
        divestAmount = 600e6;
        daiAmount = toBN("5000", 18);
        maxSweep = toBN("500000", 18);
        sweepAmount = toBN("1000", 18);

        blockNumber = await ethers.provider.getBlockNumber();
        await resetNetwork(Const.BLOCK_NUMBER);
        await sendEth(Const.EXCHANGER_ADMIN);
        await sendEth(addresses.usdc_holder);
        await sendEth(addresses.usdc);

        // ------------- Deployment of contracts -------------
        
        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [
            lzEndpoint.address,
            borrower.address,
            2500 // 0.25%
        ]);
        sweep = await Proxy.deployed();
        await sweep.setTreasury(addresses.treasury);

        // Token Contract
        Token = await ethers.getContractFactory("ERC20");
        usdc = await Token.attach(addresses.usdc);
        usdPlus = await Token.attach(addresses.usdPlus);

        // Uniswap Contract
        Uniswap = await ethers.getContractFactory("UniswapAMM");
        amm = await Uniswap.deploy(
            sweep.address,
            addresses.usdc,
            addresses.sequencer_feed,
            Const.FEE,
            addresses.oracle_dai_usd,
            86400
        );
        await sweep.setAMM(amm.address);

        Asset = await ethers.getContractFactory("USDPlusAsset");
        asset = await Asset.deploy(
            'USDPlus Asset',
            sweep.address,
            addresses.usdc,
            addresses.usdPlus,
            addresses.usdc_e,
            addresses.usdPlus_exchanger,
			addresses.oracle_usdc_usd,
            borrower.address,
            Const.FEE
        );

        // add asset as a minter
        await sweep.addMinter(asset.address, maxSweep);
    });

    after(async () => {
        await resetNetwork(blockNumber);
    });

    describe("asset constraints", async function () {
        it("only borrower can inveset", async function () {
            await expect(asset.connect(other).invest(depositAmount, 0))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
        });

        it("only borrower can divest", async function () {
            await expect(asset.connect(other).divest(depositAmount, 0))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
        });
    });

    describe("invest and divest functions", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc_holder);
            await usdc.connect(user).transfer(asset.address, depositAmount);
            expect(await usdc.balanceOf(asset.address)).to.equal(depositAmount)
        });

        it("invest correctly", async function () {
            expect(await asset.assetValue()).to.equal(Const.ZERO);
            expect(await asset.currentValue()).to.closeTo(depositAmount, 1e6);

            await asset.invest(investAmount, Const.SLIPPAGE);
            expect(await usdPlus.balanceOf(asset.address)).to.above(Const.ZERO);
            console.log(await asset.assetValue())
            await asset.invest(investAmount, Const.SLIPPAGE);
            expect(await usdc.balanceOf(asset.address)).to.equal(Const.ZERO);
            console.log(await asset.assetValue())
            await expect(asset.invest(investAmount, 0))
                .to.be.revertedWithCustomError(asset, "NotEnoughBalance");
        });

//         it("divest correctly", async function () {
//             usdcBalance = await usdc.balanceOf(asset.address);
//             usdPlusBalance = await usdPlus.balanceOf(asset.address);
//             console.log(await asset.assetValue())
// console.log(111)
// await asset.divest(divestAmount, Const.SLIPPAGE);
// console.log(222)
// expect(await usdc.balanceOf(asset.address)).to.above(usdcBalance);
// expect(await usdPlus.balanceOf(asset.address)).to.below(usdPlusBalance);

// await asset.divest(divestAmount, Const.SLIPPAGE);
// console.log(333)
//             expect(await usdPlus.balanceOf(asset.address)).to.eq(Const.ZERO);
//         });
    });
});

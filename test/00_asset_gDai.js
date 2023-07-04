const { expect } = require("chai");
const { ethers } = require("hardhat");
const { networks } = require("../hardhat.config");
const { addresses, chainId } = require("../utils/address");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { impersonate, sendEth, increaseTime, Const, toBN } = require("../utils/helper_functions");

contract("gDAI Asset", async function () {
    before(async () => {
        if (Number(chainId) !== 42161) return;
        url = networks.hardhat.forking.url;
        blockNumber = await ethers.provider.getBlockNumber();
        
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
        dai = await Token.attach(addresses.dai);
        gDai = await ethers.getContractAt('IGTokenMock', addresses.gDai);
        openTrade = await ethers.getContractAt('IOpenTradesPnlFeedMock', addresses.gDai_open_trades);

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(amm.address);

        Asset = await ethers.getContractFactory("GDAIAsset");
        asset = await Asset.deploy(
            'GDAI Asset',
            sweep.address,
            addresses.usdc,
            addresses.gDai,
            borrower.address
        );

        // add asset as a minter
        await sweep.addMinter(asset.address, maxSweep);
        // await sweep.minterMint(amm.address, sweepAmount);

        // AMM initialize
        user = await impersonate(addresses.usdc)
        await sendEth(user.address);
        await usdc.connect(user).transfer(amm.address, usdxAmount);

        user = await impersonate(addresses.dai_holder)
        await sendEth(user.address);
        await dai.connect(user).transfer(amm.address, daiAmount);
    });

    after(async() => {
        await helpers.reset(url, blockNumber);
    });

    const epochLoop = async (n) => {
        if(n > 0) {
            const delay = 3 * 24 * 3600; // 3 days
            await increaseTime(delay);
            currentBlock = await ethers.provider.getBlock('latest');

            // start new epoch
            await openTrade.connect(user).forceNewEpoch();

            n--;
            await epochLoop(n);
        }

        return;
    }

    describe("asset constraints", async function () {
        it("only borrower can inveset", async function () {
            await expect(asset.connect(other).invest(depositAmount, Const.SLIPPAGE))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
        });

        it("only borrower can divest", async function () {
            await expect(asset.connect(other).divest(depositAmount, Const.SLIPPAGE))
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
            await asset.invest(depositAmount, Const.SLIPPAGE);
            expect(await usdc.balanceOf(asset.address)).to.equal(Const.ZERO);
            expect(await gDai.balanceOf(asset.address)).to.above(Const.ZERO);
        });

        it("send withdraw request", async function () {
            requestStatus = await asset.requestStatus();

            if(!requestStatus.available) {
                // Time delay till epoch start
                currentBlock = await ethers.provider.getBlock('latest');
                restTime = requestStatus.startTime - currentBlock.timestamp;
                await increaseTime(restTime);

                // start new epoch
                await openTrade.connect(user).forceNewEpoch();
            }

            // Request for withdraw
            expect(await asset.unlockEpoch()).to.equal(Const.ZERO);
            expect(await asset.divestStartTime()).to.equal(Const.ZERO);

            await asset.request(withdrawAmount);

            expect(await asset.unlockEpoch()).to.above(Const.ZERO);
            expect(await asset.divestStartTime()).to.above(Const.ZERO);
        });

        it("divest correctly", async function () {
            const currentEpoch = await gDai.currentEpoch()
            const unlockEpoch = await asset.unlockEpoch()
            const diffEpoch = unlockEpoch.toNumber() - currentEpoch.toNumber();
            await epochLoop(diffEpoch);
            
            divestStatus = await asset.divestStatus();
            
            if(!divestStatus.available) return;

            const usdcBalance = await usdc.balanceOf(asset.address);
            const gDaiBalance = await gDai.balanceOf(asset.address);

            await asset.divest(withdrawAmount, Const.SLIPPAGE);

            expect(await usdc.balanceOf(asset.address)).to.above(usdcBalance);
            expect(await gDai.balanceOf(asset.address)).to.below(gDaiBalance);
        });
    });
});

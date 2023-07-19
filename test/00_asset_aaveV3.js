const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses } = require("../utils/address");
const { impersonate, toBN, Const } = require("../utils/helper_functions");
const { increaseTime } = require('../utils/helper_functions');

contract('Aave V3 Asset', async () => {
    before(async () => {
        [admin, liquidator, guest, lzEndpoint] = await ethers.getSigners();
        // Variables
        usdxAmount = 1000e6;
        depositAmount = 10e6;
        newRatio = Const.RATIO * 10;
        mintAmount = toBN("50", 18);
        maxBorrow = toBN("100", 18);
        sweepAmount = toBN("1000", 18);

        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [
            lzEndpoint.address,
            addresses.owner,
            2500 // 0.25%
        ]);
        sweep = await Proxy.deployed();
        user = await impersonate(addresses.owner);
        await sweep.connect(user).setTreasury(addresses.treasury);

        ERC20 = await ethers.getContractFactory("ERC20");
        usdx = await ERC20.attach(addresses.usdc);
        aave_usdx = await ERC20.attach(addresses.aave_usdc);

        Uniswap = await ethers.getContractFactory("UniswapMock");
        uniswap_amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(uniswap_amm.address);

        AaveAsset = await ethers.getContractFactory("AaveV3Asset");
        aaveAsset = await AaveAsset.deploy(
            'Aave Asset',
            sweep.address,
            addresses.usdc,
            addresses.aave_usdc,
            addresses.aaveV3_pool,
            addresses.multisig
        );

        // add asset as a minter
        await sweep.addMinter(aaveAsset.address, sweepAmount);
        await sweep.addMinter(admin.address, sweepAmount.mul(3));

        // mint sweep for the liquidator
        // simulates a pool in uniswap with 10000 SWEEP/USDX
        await sweep.connect(admin).mint(sweepAmount.mul(3));
        await sweep.connect(admin).transfer(liquidator.address, sweepAmount);
        await sweep.connect(admin).transfer(uniswap_amm.address, sweepAmount);
        await sweep.connect(admin).transfer(addresses.multisig, sweepAmount);

        user = await impersonate(addresses.usdc)
        await usdx.connect(user).transfer(uniswap_amm.address, usdxAmount);

        user = await impersonate(addresses.multisig);
        // config stabilizer
        await aaveAsset.connect(user).configure(
            Const.RATIO,
            Const.spreadFee,
            maxBorrow,
            Const.DISCOUNT,
            Const.DAYS_5,
            Const.RATIO,
            mintAmount,
            Const.TRUE,
            Const.URL
        );

        await sweep.connect(user).approve(aaveAsset.address, sweepAmount);
        await sweep.connect(liquidator).approve(aaveAsset.address, sweepAmount);
    });

    describe("Initial Test", async function () {
        it('deposit usdc to the asset', async () => {
            await usdx.connect(user).transfer(aaveAsset.address, depositAmount);
            expect(await usdx.balanceOf(aaveAsset.address)).to.equal(depositAmount);
        });

        it('mint and sell sweep', async () => {
            // Mint Sweep
            await expect(aaveAsset.connect(guest).borrow(mintAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.connect(user).borrow(mintAmount);
            expect(await aaveAsset.sweepBorrowed()).to.equal(mintAmount);

            // Sell Sweep
            await expect(aaveAsset.connect(guest).sellSweepOnAMM(mintAmount, 0))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await expect(aaveAsset.connect(user).sellSweepOnAMM(0, 0))
                .to.be.revertedWithCustomError(aaveAsset, 'NotEnoughBalance');

            await aaveAsset.connect(user).sellSweepOnAMM(mintAmount, 0);
            expect(await sweep.balanceOf(aaveAsset.address)).to.equal(Const.ZERO);
            expect(await usdx.balanceOf(aaveAsset.address)).to.above(depositAmount);
        });

        it('invest and divest to the Aave', async () => {
            // Invest usdx
            investAmount = 50e6;
            await expect(aaveAsset.connect(guest).invest(investAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.connect(user).invest(investAmount);
            expect(await aaveAsset.assetValue()).to.closeTo(investAmount, 1);

            // Delay 100 days
            await increaseTime(Const.DAY * 100);

            // Divest usdx
            divestAmount = 600e6;
            await expect(aaveAsset.connect(guest).divest(divestAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.connect(user).divest(divestAmount);
            expect(await aaveAsset.assetValue()).to.closeTo(Const.ZERO, 1);
        });

        it('buy and repay sweep', async () => {
            // Buy Sweep
            await expect(aaveAsset.connect(guest).buySweepOnAMM(divestAmount, Const.ZERO))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.connect(user).buySweepOnAMM(divestAmount, Const.ZERO);

            expect(await sweep.balanceOf(aaveAsset.address)).to.above(Const.ZERO);

            // Repay Sweep
            await expect(aaveAsset.connect(guest).repay(maxBorrow))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.connect(user).repay(maxBorrow);

            expect(await aaveAsset.sweepBorrowed()).to.equal(Const.ZERO);
        });

        it('withdraws sweep and usdx', async () => {
            expect(await aaveAsset.currentValue()).to.above(Const.ZERO);
            expect(await aaveAsset.getEquityRatio()).to.equal(1e6); // without debt
            expect(await usdx.balanceOf(aaveAsset.address)).to.equal(Const.ZERO);

            sweepBalance = await sweep.balanceOf(aaveAsset.address);
            sweepAmount = sweepBalance.div(2);
            await aaveAsset.connect(user).sellSweepOnAMM(sweepAmount, Const.ZERO);
            usdxAmount = await usdx.balanceOf(aaveAsset.address)
            sweepAmount = await sweep.balanceOf(aaveAsset.address);

            await aaveAsset.connect(user).withdraw(sweep.address, sweepAmount);
            await aaveAsset.connect(user).withdraw(usdx.address, usdxAmount);

            expect(await usdx.balanceOf(aaveAsset.address)).to.closeTo(Const.ZERO, 1);
            expect(await sweep.balanceOf(aaveAsset.address)).to.closeTo(Const.ZERO, 1);
        });
    });

    describe("Liquidate Test", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.multisig);
            await usdx.connect(user).transfer(aaveAsset.address, depositAmount);
            expect(await usdx.balanceOf(aaveAsset.address)).to.equal(depositAmount)
        });

        it('mint and sell sweep', async () => {
            // Mint Sweep
            await expect(aaveAsset.connect(guest).borrow(mintAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.connect(user).borrow(mintAmount);
            expect(await aaveAsset.sweepBorrowed()).to.equal(mintAmount);

            // Sell Sweep
            await expect(aaveAsset.connect(guest).sellSweepOnAMM(mintAmount, Const.ZERO))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await expect(aaveAsset.connect(user).sellSweepOnAMM(Const.ZERO, Const.ZERO))
                .to.be.revertedWithCustomError(aaveAsset, 'NotEnoughBalance');
            await aaveAsset.connect(user).sellSweepOnAMM(mintAmount, Const.ZERO);

            expect(await usdx.balanceOf(aaveAsset.address)).to.above(depositAmount);
        });

        it('invest to the Aave', async () => {
            investAmount = 50 * 1e6;
            await expect(aaveAsset.connect(guest).invest(investAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.connect(user).invest(investAmount);

            expect(await aaveAsset.assetValue()).to.closeTo(investAmount, 1);
        });

        it('set as defaulted', async () => {
            await aaveAsset.connect(user).configure(
                newRatio,
                Const.FEE,
                maxBorrow,
                Const.DISCOUNT,
                Const.DAYS_5,
                Const.RATIO,
                mintAmount,
                Const.TRUE,
                Const.URL
            );
            expect(await aaveAsset.isDefaulted()).to.equal(Const.TRUE);
        });

        it('liquidate asset', async () => {
            expect(await aaveAsset.sweepBorrowed()).to.equal(mintAmount);

            await aaveAsset.connect(liquidator).liquidate();

            expect(await aaveAsset.sweepBorrowed()).to.equal(Const.ZERO);
            expect(await aaveAsset.accruedFee()).to.equal(Const.ZERO);
            expect(await aaveAsset.getDebt()).to.equal(Const.ZERO);
            expect(await aaveAsset.assetValue()).to.equal(Const.ZERO);
            expect(await aaveAsset.isDefaulted()).to.equal(Const.FALSE);
            expect(await aaveAsset.getEquityRatio()).to.equal(newRatio);
        });
    })
});
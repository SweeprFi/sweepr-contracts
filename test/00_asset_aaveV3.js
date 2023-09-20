const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses } = require("../utils/address");
const { impersonate, toBN, Const, sendEth, increaseTime } = require("../utils/helper_functions");

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
            50 // 0.005%
        ]);
        sweep = await Proxy.deployed();
        user = await impersonate(addresses.owner);
        await sweep.connect(user).setTreasury(addresses.treasury);

        ERC20 = await ethers.getContractFactory("ERC20");
        usdx = await ERC20.attach(addresses.usdc_e);

        Uniswap = await ethers.getContractFactory("UniswapMock");
        uniswap_amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(uniswap_amm.address);

        AaveAsset = await ethers.getContractFactory("AaveV3Asset");
        aaveAsset = await AaveAsset.deploy(
            'Aave Asset',
            sweep.address,
            addresses.usdc_e,
            addresses.aave_usdc,
            addresses.aaveV3_pool,
            addresses.oracle_usdc_usd,
            admin.address
        );

        // add asset as a minter
        await sweep.addMinter(aaveAsset.address, sweepAmount);
        await sweep.addMinter(admin.address, sweepAmount.mul(3));

        // mint sweep for the liquidator
        // simulates a pool in uniswap with 10000 SWEEP/USDX
        await sweep.connect(admin).mint(sweepAmount.mul(3));
        await sweep.connect(admin).transfer(liquidator.address, sweepAmount);
        await sweep.connect(admin).transfer(uniswap_amm.address, sweepAmount);

        user = await impersonate(addresses.usdc_e);
        await sendEth(user.address);
        await usdx.connect(user).transfer(uniswap_amm.address, usdxAmount);

        user = await impersonate(addresses.multisig);
        // config stabilizer
        await aaveAsset.configure(
            Const.RATIO,
            Const.spreadFee,
            maxBorrow,
            Const.DISCOUNT,
            Const.DAYS_5,
            Const.RATIO,
            mintAmount,
            Const.TRUE,
            Const.FALSE,
            Const.URL
        );

        await sweep.approve(aaveAsset.address, sweepAmount);
        await sweep.connect(liquidator).approve(aaveAsset.address, sweepAmount);
    });

    describe("Initial Test", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc_e);
            await usdx.connect(user).transfer(aaveAsset.address, depositAmount);
            expect(await usdx.balanceOf(aaveAsset.address)).to.equal(depositAmount);
        });

        it('mint and sell sweep', async () => {
            // Mint Sweep
            await expect(aaveAsset.connect(guest).borrow(mintAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.borrow(mintAmount);
            expect(await aaveAsset.sweepBorrowed()).to.equal(mintAmount);

            // Sell Sweep
            await expect(aaveAsset.connect(guest).sellSweepOnAMM(mintAmount, 0))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await expect(aaveAsset.sellSweepOnAMM(0, 0))
                .to.be.revertedWithCustomError(aaveAsset, 'NotEnoughBalance');

            await aaveAsset.sellSweepOnAMM(mintAmount, 0);
            expect(await sweep.balanceOf(aaveAsset.address)).to.equal(Const.ZERO);
            expect(await usdx.balanceOf(aaveAsset.address)).to.above(depositAmount);
        });

        it('invest and divest to the Aave', async () => {
            // Invest usdx
            investAmount = 50e6;
            await expect(aaveAsset.connect(guest).invest(investAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.invest(investAmount);
            expect(await aaveAsset.assetValue()).to.above(Const.ZERO);

            // Delay 100 days
            await increaseTime(Const.DAY * 100);

            // Divest usdx
            divestAmount = 600e6;
            await expect(aaveAsset.connect(guest).divest(divestAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.divest(divestAmount);
            expect(await aaveAsset.assetValue()).to.closeTo(Const.ZERO, 1);
        });

        it('buy and repay sweep', async () => {
            // Buy Sweep
            divestAmount = 600e6;
            await expect(aaveAsset.connect(guest).buySweepOnAMM(divestAmount, Const.ZERO))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.buySweepOnAMM(divestAmount, Const.ZERO);

            expect(await sweep.balanceOf(aaveAsset.address)).to.above(Const.ZERO);

            // Repay Sweep
            await expect(aaveAsset.connect(guest).repay(maxBorrow))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.repay(maxBorrow);

            expect(await aaveAsset.sweepBorrowed()).to.equal(Const.ZERO);
        });

        it('withdraws sweep and usdx', async () => {
            expect(await aaveAsset.currentValue()).to.above(Const.ZERO);
            // expect(await aaveAsset.getEquityRatio()).to.equal(1e6); // without debt
            expect(await usdx.balanceOf(aaveAsset.address)).to.equal(Const.ZERO);

            sweepBalance = await sweep.balanceOf(aaveAsset.address);
            sweepAmount = sweepBalance.div(2);
            await aaveAsset.sellSweepOnAMM(sweepAmount, Const.ZERO);
            usdxAmount = await usdx.balanceOf(aaveAsset.address)
            sweepAmount = await sweep.balanceOf(aaveAsset.address);

            await aaveAsset.withdraw(sweep.address, sweepAmount);
            await aaveAsset.withdraw(usdx.address, usdxAmount);

            expect(await usdx.balanceOf(aaveAsset.address)).to.closeTo(Const.ZERO, 1);
            expect(await sweep.balanceOf(aaveAsset.address)).to.closeTo(Const.ZERO, 1);
        });
    });

    describe("Liquidate Test", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc_e);
            oldBal = await usdx.balanceOf(aaveAsset.address)
            await usdx.connect(user).transfer(aaveAsset.address, depositAmount);
            expect(await usdx.balanceOf(aaveAsset.address) - oldBal).to.equal(depositAmount)
        });

        it('mint and sell sweep', async () => {
            // Mint Sweep
            await expect(aaveAsset.connect(guest).borrow(mintAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.borrow(mintAmount);

            // Sell Sweep
            await expect(aaveAsset.connect(guest).sellSweepOnAMM(mintAmount, Const.ZERO))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await expect(aaveAsset.sellSweepOnAMM(Const.ZERO, Const.ZERO))
                .to.be.revertedWithCustomError(aaveAsset, 'NotEnoughBalance');
            await aaveAsset.sellSweepOnAMM(mintAmount, Const.ZERO);

            expect(await usdx.balanceOf(aaveAsset.address)).to.above(depositAmount);
        });

        it('invest to the Aave', async () => {
            investAmount = 60e6;
            await expect(aaveAsset.connect(guest).invest(investAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
            await aaveAsset.invest(investAmount);

            await expect(aaveAsset.invest(investAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'NotEnoughBalance');
        });

        it('set as defaulted', async () => {
            await aaveAsset.configure(
                newRatio,
                Const.FEE,
                maxBorrow,
                Const.DISCOUNT,
                Const.DAYS_5,
                Const.RATIO,
                mintAmount,
                Const.TRUE,
                Const.FALSE,
                Const.URL
            );
            expect(await aaveAsset.isDefaulted()).to.equal(Const.TRUE);
        });

        it('liquidate asset', async () => {
            // expect(await aaveAsset.sweepBorrowed()).to.equal(mintAmount);
            await aaveAsset.connect(liquidator).liquidate();

            expect(await aaveAsset.sweepBorrowed()).to.equal(Const.ZERO);
            expect(await aaveAsset.accruedFee()).to.equal(Const.ZERO);
            expect(await aaveAsset.getDebt()).to.equal(Const.ZERO);
            expect(await aaveAsset.assetValue()).to.equal(Const.ZERO);
            expect(await aaveAsset.isDefaulted()).to.equal(Const.FALSE);
            expect(await aaveAsset.getEquityRatio()).to.equal(Const.ZERO);
        });
    })
});
const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses } = require("../utils/address");
const { impersonate, increaseTime, Const, toBN } = require("../utils/helper_functions");

contract('Compound V3 Asset', async () => {
    before(async () => {
        [borrower, guest, lzEndpoint] = await ethers.getSigners();

        maxMint = toBN("10000", 18);
        borrowAmount = toBN("1000", 18);
        repayAmount = toBN("1100", 18);
        depositAmount = 500e6;
        divestAmount = 700e6;

        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [
            lzEndpoint.address,
            addresses.owner,
            2500 // 0.25%
        ]);
        sweep = await Proxy.deployed();
        await sweep.setTreasury(addresses.treasury);

        ERC20 = await ethers.getContractFactory("ERC20");
        usdx = await ERC20.attach(addresses.usdc);
        cusdc = await ERC20.attach(addresses.comp_cusdc);

        CompoundAsset = await ethers.getContractFactory("CompV3Asset");
        compAsset = await CompoundAsset.deploy(
            'Compound V3 Asset',
            sweep.address,
            addresses.usdc,
            addresses.comp_cusdc,
            borrower.address
        );

        Oracle = await ethers.getContractFactory("AggregatorMock");
        usdcOracle = await Oracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(amm.address);

        // config stabilizer
        await compAsset.configure(
            Const.RATIO, Const.spreadFee, maxMint, Const.DISCOUNT,
            Const.DAYS_5, Const.RATIO, maxMint, Const.TRUE, Const.URL
        );

        // simulates a pool in uniswap with 10000 SWEEP/USDX
        await sweep.addMinter(borrower.address, maxMint.mul(2));
        await sweep.minterMint(amm.address, maxMint);
        await sweep.minterMint(guest.address, maxMint);

        user = await impersonate(addresses.usdc)
        await usdx.connect(user).transfer(amm.address, 10000e6);

        await sweep.addMinter(compAsset.address, maxMint);
    });

    describe("Main test", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc);
            await usdx.connect(user).transfer(compAsset.address, depositAmount);
            expect(await usdx.balanceOf(compAsset.address)).to.equal(depositAmount);
        });

        it('mint and sell sweep', async () => {
            // Mint Sweep
            await expect(compAsset.connect(guest).borrow(borrowAmount))
                .to.be.revertedWithCustomError(compAsset, 'NotBorrower');
            await compAsset.borrow(borrowAmount);
            expect(await compAsset.sweepBorrowed()).to.equal(borrowAmount);

            // Sell Sweep
            await expect(compAsset.connect(guest).sellSweepOnAMM(borrowAmount, 0))
                .to.be.revertedWithCustomError(compAsset, 'NotBorrower');
            await expect(compAsset.sellSweepOnAMM(0, 0))
                .to.be.revertedWithCustomError(compAsset, 'NotEnoughBalance');

            await compAsset.sellSweepOnAMM(borrowAmount, 0);
            expect(await sweep.balanceOf(compAsset.address)).to.equal(Const.ZERO);
            expect(await cusdc.balanceOf(compAsset.address)).to.equal(Const.ZERO);
            expect(await usdx.balanceOf(compAsset.address)).to.greaterThan(depositAmount);
        });

        it('invest and divest to the Compound', async () => {
            investAmount = await usdx.balanceOf(compAsset.address);
            // Invest usdx
            await expect(compAsset.connect(guest).invest(investAmount))
                .to.be.revertedWithCustomError(compAsset, 'NotBorrower');
            await compAsset.invest(investAmount);

            balance = await cusdc.balanceOf(compAsset.address);
            expect(await compAsset.assetValue()).to.equal(balance);

            // Delay 1 year
            await increaseTime(Const.DAY * 365);

            expect(await compAsset.assetValue()).to.greaterThan(balance);

            // Divest usdx
            await expect(compAsset.connect(guest).divest(balance))
                .to.be.revertedWithCustomError(compAsset, 'NotBorrower');
            balance = await cusdc.balanceOf(compAsset.address);
            await compAsset.divest(depositAmount);

            expect(await compAsset.assetValue()).to.greaterThan(Const.ZERO);
            expect(await cusdc.balanceOf(compAsset.address)).to.greaterThan(Const.ZERO);
            expect(await usdx.balanceOf(compAsset.address)).to.equal(depositAmount);

            await compAsset.divest(balance);

            expect(await compAsset.assetValue()).to.closeTo(Const.ZERO, 1);
            expect(await sweep.balanceOf(compAsset.address)).to.equal(Const.ZERO);
            expect(await cusdc.balanceOf(compAsset.address)).to.equal(Const.ZERO);
            expect(await usdx.balanceOf(compAsset.address)).to.greaterThan(investAmount);
        });

        it('buy and repay sweep', async () => {
            // Buy Sweep
            await expect(compAsset.connect(guest).buySweepOnAMM(repayAmount, Const.ZERO))
                .to.be.revertedWithCustomError(compAsset, 'NotBorrower');
            await compAsset.buySweepOnAMM(1100e6, Const.ZERO);

            expect(await sweep.balanceOf(compAsset.address)).to.greaterThan(borrowAmount);

            // Repay Sweep
            await sweep.approve(compAsset.address, repayAmount);
            await expect(compAsset.connect(guest).repay(repayAmount))
                .to.be.revertedWithCustomError(compAsset, 'NotBorrower');
            await compAsset.repay(repayAmount);

            expect(await compAsset.sweepBorrowed()).to.equal(Const.ZERO);
            expect(await sweep.balanceOf(compAsset.address)).to.greaterThan(Const.ZERO);
            expect(await usdx.balanceOf(compAsset.address)).to.not.greaterThan(investAmount);
        });

        it('withdraws sweep and usdx', async () => {
            expect(await compAsset.currentValue()).to.greaterThan(Const.ZERO);
            expect(await compAsset.getEquityRatio()).to.equal(1e6); // without debt ~ 100%

            sweepBalance = await sweep.balanceOf(compAsset.address);
            usdxBalance = await usdx.balanceOf(compAsset.address);

            await compAsset.withdraw(sweep.address, sweepBalance);
            await compAsset.withdraw(usdx.address, usdxBalance);

            expect(await usdx.balanceOf(compAsset.address)).to.equal(Const.ZERO, 1);
            expect(await sweep.balanceOf(compAsset.address)).to.equal(Const.ZERO, 1);
        });
    });

    describe("Liquidation test", async function () {
        it('setup', async () => {
            user = await impersonate(addresses.usdc);
            await usdx.connect(user).transfer(compAsset.address, depositAmount);
            await compAsset.borrow(borrowAmount);
            await compAsset.sellSweepOnAMM(borrowAmount, 0);
            investAmount = await usdx.balanceOf(compAsset.address);
            await compAsset.invest(investAmount.mul(2));

            balance = await cusdc.balanceOf(compAsset.address);
            expect(await compAsset.assetValue()).to.equal(balance);
            expect(await compAsset.sweepBorrowed()).to.equal(borrowAmount);
            expect(await compAsset.getDebt()).to.greaterThan(borrowAmount);
            expect(await compAsset.isDefaulted()).to.equal(Const.FALSE);
        });

        it('set as defaulted', async () => {
            newRatio = Const.RATIO * 10;
            await compAsset.configure(
                newRatio, Const.FEE, maxMint, Const.DISCOUNT, Const.DAYS_5,
                Const.RATIO, maxMint, Const.TRUE, Const.URL
            );
            expect(await compAsset.isDefaulted()).to.equal(Const.TRUE);
        });

        it('liquidate asset', async () => {
            await sweep.connect(guest).approve(compAsset.address, maxMint);

            await compAsset.connect(guest).liquidate();

            expect(await compAsset.sweepBorrowed()).to.equal(Const.ZERO);
            expect(await compAsset.accruedFee()).to.equal(Const.ZERO);
            expect(await compAsset.getDebt()).to.equal(Const.ZERO);
            expect(await compAsset.assetValue()).to.equal(Const.ZERO);
            expect(await compAsset.isDefaulted()).to.equal(Const.FALSE);
            expect(await compAsset.getEquityRatio()).to.equal(newRatio);
            expect(await cusdc.balanceOf(compAsset.address)).to.equal(Const.ZERO);
            expect(await cusdc.balanceOf(guest.address)).to.greaterThan(depositAmount);
        });
    })
});

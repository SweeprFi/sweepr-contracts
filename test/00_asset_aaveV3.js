const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses } = require("../utils/address");
const { impersonate } = require("../utils/helper_functions");

contract('Aave V3 Asset - Local', async () => {
    before(async () => {
        [admin, liquidator, guest, lzEndpoint] = await ethers.getSigners();
        ZERO = 0;
        // Variables
        usdxAmount = 1000e6;
        sweepAmount = ethers.utils.parseUnits("1000", 18);
        maxBorrow = ethers.utils.parseUnits("100", 18);
        depositAmount = 10e6;
        minEquityRatio = 10e4; // 10%
        mintAmount = ethers.utils.parseUnits("50", 18);
        spreadFee = 3e4; // 3%
        liquidatorDiscount = 2e4; // 2%
        callDelay = 432000; // 5 days
        autoInvestMinEquityRatio = 10e4; // 10%
        autoInvestMinAmount = ethers.utils.parseUnits("10", 18);
        autoInvest = true;

        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
        sweep = await Proxy.deployed();
        await sweep.setTreasury(addresses.treasury);

        ERC20 = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
        usdx = await ERC20.attach(addresses.usdc);
        aave_usdx = await ERC20.attach(addresses.aave_usdc);

        Uniswap = await ethers.getContractFactory("UniswapMock");
        uniswap_amm = await Uniswap.deploy(sweep.address);

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        AaveAsset = await ethers.getContractFactory("AaveV3Asset");
        aaveAsset = await AaveAsset.deploy(
            'Aave Asset',
            sweep.address,
            addresses.usdc,
            addresses.aave_usdc,
            addresses.aaveV3_pool,
            uniswap_amm.address,
            addresses.multisig,
            usdOracle.address
        );

        // add asset as a minter
        await sweep.addMinter(aaveAsset.address, sweepAmount);
        await sweep.addMinter(admin.address, sweepAmount.mul(3));

        // mint sweep for the liquidator
        // simulates a pool in uniswap with 10000 SWEEP/USDX
        await sweep.minter_mint(liquidator.address, sweepAmount);
        await sweep.minter_mint(uniswap_amm.address, sweepAmount);
        await sweep.minter_mint(addresses.multisig, sweepAmount);

        user = await impersonate(addresses.usdc)
        await usdx.connect(user).transfer(uniswap_amm.address, usdxAmount);

        user = await impersonate(addresses.multisig);
        // config stabilizer
        await aaveAsset.connect(user).configure(
            minEquityRatio,
            spreadFee,
            maxBorrow,
            liquidatorDiscount,
            callDelay,
            autoInvestMinEquityRatio,
            autoInvestMinAmount,
            autoInvest,
            "htttp://test.com"
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
                .to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).borrow(mintAmount);
            expect(await aaveAsset.sweep_borrowed()).to.equal(mintAmount);

            // Sell Sweep
            await expect(aaveAsset.connect(guest).sellSweepOnAMM(mintAmount, 0))
                .to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await expect(aaveAsset.connect(user).sellSweepOnAMM(0, 0))
                .to.be.revertedWithCustomError(aaveAsset, 'NotEnoughBalance');

            await aaveAsset.connect(user).sellSweepOnAMM(mintAmount, 0);
            expect(await sweep.balanceOf(aaveAsset.address)).to.equal(ZERO);
            expect(await usdx.balanceOf(aaveAsset.address)).to.above(depositAmount);
        });

        it('invest and divest to the Aave', async () => {
            // Invest usdx
            investAmount = 50e6;
            await expect(aaveAsset.connect(guest).invest(investAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).invest(investAmount);
            expect(await aaveAsset.assetValue()).to.closeTo(investAmount, 1);

            // Delay 100 days
            await network.provider.send("evm_increaseTime", [8640000]);
            await network.provider.send("evm_mine");

            // Divest usdx
            divestAmount = 600e6;
            await expect(aaveAsset.connect(guest).divest(divestAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).divest(divestAmount);
            expect(await aaveAsset.assetValue()).to.closeTo(ZERO, 1);
        });

        it('buy and repay sweep', async () => {
            // Buy Sweep
            await expect(aaveAsset.connect(guest).buySweepOnAMM(divestAmount, 0))
                .to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).buySweepOnAMM(divestAmount, 0);

            expect(await sweep.balanceOf(aaveAsset.address)).to.above(ZERO);

            // Repay Sweep
            await expect(aaveAsset.connect(guest).repay(maxBorrow))
                .to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).repay(maxBorrow);

            expect(await aaveAsset.sweep_borrowed()).to.equal(ZERO);
        });

        it('withdraws sweep and usdx', async () => {
            expect(await aaveAsset.currentValue()).to.above(ZERO);
            expect(await aaveAsset.getEquityRatio()).to.equal(1e6); // without debt
            expect(await usdx.balanceOf(aaveAsset.address)).to.equal(ZERO);

            sweepBalance = await sweep.balanceOf(aaveAsset.address);
            sweepAmount = sweepBalance.div(2);
            await aaveAsset.connect(user).sellSweepOnAMM(sweepAmount, 0);
            usdxAmount = await usdx.balanceOf(aaveAsset.address)
            sweepAmount = await sweep.balanceOf(aaveAsset.address);

            await aaveAsset.connect(user).withdraw(sweep.address, sweepAmount);
            await aaveAsset.connect(user).withdraw(usdx.address, usdxAmount);

            expect(await usdx.balanceOf(aaveAsset.address)).to.closeTo(ZERO, 1);
            expect(await sweep.balanceOf(aaveAsset.address)).to.closeTo(ZERO, 1);
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
                .to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).borrow(mintAmount);
            expect(await aaveAsset.sweep_borrowed()).to.equal(mintAmount);

            // Sell Sweep
            await expect(aaveAsset.connect(guest).sellSweepOnAMM(mintAmount, 0))
                .to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await expect(aaveAsset.connect(user).sellSweepOnAMM(0, 0))
                .to.be.revertedWithCustomError(aaveAsset, 'NotEnoughBalance');
            await aaveAsset.connect(user).sellSweepOnAMM(mintAmount, 0);

            expect(await usdx.balanceOf(aaveAsset.address)).to.above(depositAmount);
        });

        it('invest to the Aave', async () => {
            investAmount = 50 * 1e6;
            await expect(aaveAsset.connect(guest).invest(investAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).invest(investAmount);

            expect(await aaveAsset.assetValue()).to.equal(investAmount);
        });

        it('set as defaulted', async () => {
            newRatio = 100e4
            await aaveAsset.connect(user).configure(
                newRatio,
                spreadFee,
                maxBorrow,
                liquidatorDiscount,
                callDelay,
                autoInvestMinEquityRatio,
                autoInvestMinAmount,
                autoInvest,
                "htttp://test.com"
            );
            expect(await aaveAsset.isDefaulted()).to.equal(true);
        });

        it('liquidate asset', async () => {
            expect(await aaveAsset.sweep_borrowed()).to.equal(mintAmount);

            await aaveAsset.connect(liquidator).liquidate();

            expect(await aaveAsset.sweep_borrowed()).to.equal(ZERO);
            expect(await aaveAsset.accruedFee()).to.equal(ZERO);
            expect(await aaveAsset.getDebt()).to.equal(ZERO);
            expect(await aaveAsset.assetValue()).to.equal(ZERO);
            expect(await aaveAsset.isDefaulted()).to.equal(false);
            expect(await aaveAsset.getEquityRatio()).to.equal(newRatio);
        });
    })
});
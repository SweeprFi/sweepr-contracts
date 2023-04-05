const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses } = require("../utils/address");

contract('Aave V3 Asset - Local', async () => {
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

    before(async () => {
        [admin, liquidator, guest] = await ethers.getSigners();
        ZERO = 0;

        Sweep = await ethers.getContractFactory("SweepDollarCoin");
        sweep = await Sweep.attach(addresses.sweep);

        ERC20 = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
        usdx = await ERC20.attach(addresses.usdc);
        aave_usdx = await ERC20.attach(addresses.aave_usdc);

        AaveAsset = await ethers.getContractFactory("AaveV3Asset");
        aaveAsset = await AaveAsset.deploy(
            'Aave Asset',
            addresses.sweep,
            addresses.usdc,
            addresses.aave_usdc,
            addresses.aaveV3_pool,
            addresses.uniswap_amm,
            addresses.multisig
        );

        await impersonate(addresses.multisig);
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

        await impersonate(sweep_owner);
        await admin.sendTransaction({ to: sweep_owner, value: ethers.utils.parseEther("5.0") });

        const amm_price = await sweep.amm_price();
        await sweep.connect(user).setTargetPrice(amm_price, amm_price);

        // add asset as a minter
        await sweep.connect(user).addMinter(aaveAsset.address, sweepAmount);

        // mint sweep for the liquidator
        await sweep.connect(user).addMinter(admin.address, maxBorrow);

        await sweep.connect(admin).minter_mint(liquidator.address, maxBorrow);
        await sweep.connect(liquidator).approve(aaveAsset.address, maxBorrow);
    });

    async function impersonate(account) {
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [account]
        });
        user = await ethers.getSigner(account);
    }

    describe("Initial Test", async function () {
        it('deposit usdc to the asset', async () => {
            await impersonate(addresses.multisig);
            await usdx.connect(user).transfer(aaveAsset.address, depositAmount);
            expect(await usdx.balanceOf(aaveAsset.address)).to.equal(depositAmount)
        });

        it('mint and sell sweep', async () => {
            // Mint Sweep
            await expect(aaveAsset.connect(guest).borrow(mintAmount)).to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).borrow(mintAmount);
            expect(await aaveAsset.sweep_borrowed()).to.equal(mintAmount);

            // Sell Sweep
            await expect(aaveAsset.connect(guest).sellSweepOnAMM(mintAmount, 0)).to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await expect(aaveAsset.connect(user).sellSweepOnAMM(0, 0)).to.be.revertedWithCustomError(aaveAsset, 'NotEnoughBalance');
            await aaveAsset.connect(user).sellSweepOnAMM(mintAmount, 0);
            expect(await sweep.balanceOf(aaveAsset.address)).to.equal(ZERO);
            expect(await usdx.balanceOf(aaveAsset.address)).to.above(depositAmount);
        });

        it('invest and divest to the Aave', async () => {
            // Invest usdx
            investAmount = 50 * 1e6;
            await expect(aaveAsset.connect(guest).invest(investAmount)).to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).invest(investAmount);
            expect(await aaveAsset.assetValue()).to.closeTo(investAmount, 1);

            // Delay 100 days
            await network.provider.send("evm_increaseTime", [8640000]);
            await network.provider.send("evm_mine");

            // Divest usdx
            divestAmount = 600 * 1e6;
            await expect(aaveAsset.connect(guest).divest(divestAmount)).to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).divest(divestAmount);
            expect(await aaveAsset.assetValue()).to.closeTo(ZERO, 1);
        });

        it('buy and repay sweep', async () => {
            // Buy Sweep
            await expect(aaveAsset.connect(guest).buySweepOnAMM(divestAmount, 0)).to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).buySweepOnAMM(divestAmount, 0);
            expect(await sweep.balanceOf(aaveAsset.address)).to.above(ZERO);

            // Repay Sweep
            await expect(aaveAsset.connect(guest).repay(maxBorrow)).to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
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
            await impersonate(addresses.multisig);
            await usdx.connect(user).transfer(aaveAsset.address, depositAmount);
            expect(await usdx.balanceOf(aaveAsset.address)).to.equal(depositAmount)
        });

        it('mint and sell sweep', async () => {
            // Delay 100 days
            await network.provider.send("evm_increaseTime", [8640000]);
            await network.provider.send("evm_mine");

            // Mint Sweep
            await expect(aaveAsset.connect(guest).borrow(mintAmount)).to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).borrow(mintAmount);
            expect(await aaveAsset.sweep_borrowed()).to.equal(mintAmount);

            // Sell Sweep
            await expect(aaveAsset.connect(guest).sellSweepOnAMM(mintAmount, 0)).to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await expect(aaveAsset.connect(user).sellSweepOnAMM(0, 0)).to.be.revertedWithCustomError(aaveAsset, 'NotEnoughBalance');
            await aaveAsset.connect(user).sellSweepOnAMM(mintAmount, 0);
            expect(await usdx.balanceOf(aaveAsset.address)).to.above(depositAmount);
        });

        it('invest to the Aave', async () => {
            investAmount = 50 * 1e6;
            await expect(aaveAsset.connect(guest).invest(investAmount)).to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).invest(investAmount);
            expect(await aaveAsset.assetValue()).to.equal(investAmount);
        });

        it('set as defaulted', async () => {
            await aaveAsset.connect(user).configure(
                100e4,
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
        });
    })
});
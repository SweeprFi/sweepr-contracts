const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { impersonate, Const, sendEth, toBN } = require("../utils/helper_functions");

contract('Balancer - Auto Invests', async () => {
    before(async () => {
        [owner, lzEndpoint] = await ethers.getSigners();
        // Variables
        BORROWER = addresses.borrower;
        USDC_ADDRESS = addresses.usdc_e;
        TREASURY = addresses.treasury;
        OWNER = addresses.owner;
        usdxAmount = 1000e6;
        depositAmount = 100e6;
        sweepAmount = toBN("1000", 18);
        maxBorrow = toBN("1000", 18);
        loanLimit = toBN("800", 18);
        mintAmount = toBN("500", 18);
        autoInvestMinAmount = toBN("10", 18);
        minRatio = 5e4; // 5%
        higherRatio = 5e5; // 5%

        // Deploys
        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [
            lzEndpoint.address,
            owner.address,
            2500 // 0.25%
        ]);
        sweep = await Proxy.deployed();

        ERC20 = await ethers.getContractFactory("ERC20");
        usdc = await ERC20.attach(USDC_ADDRESS);

        Balancer = await ethers.getContractFactory("Balancer");
        balancer = await Balancer.deploy(sweep.address, lzEndpoint.address);

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(amm.address);

        AaveAsset = await ethers.getContractFactory("AaveV3Asset");
        assets = await Promise.all(
            Array(6).fill().map(async () => {
                return await AaveAsset.deploy(
                    'Aave Asset',
                    sweep.address,
                    USDC_ADDRESS,
                    addresses.aave_usdc,
                    addresses.aaveV3_pool,
                    addresses.oracle_usdc_usd,
                    BORROWER
                );
            })
        )
    });

    describe('Auto invests - Balancer & Stabilizers', async () => {
        it('Config the initial state', async () => {
            // config the assets
            user = await impersonate(BORROWER);
            await Promise.all(
                assets.map(async (asset, index) => {
                    if (index < 2) {
                        await asset.connect(user).configure(
                            Const.RATIO,
                            Const.spreadFee,
                            loanLimit,
                            Const.DISCOUNT,
                            Const.DAYS_5,
                            minRatio,
                            autoInvestMinAmount,
                            Const.TRUE,
                            Const.URL
                        );
                    }
                })
            );

            // Loan limit = 0.
            await assets[2].connect(user).configure(
                Const.RATIO,
                Const.spreadFee,
                Const.ZERO,
                Const.DISCOUNT,
                Const.DAYS_5,
                minRatio,
                autoInvestMinAmount,
                Const.TRUE,
                Const.URL
            );

            // autoInvest = false
            await assets[3].connect(user).configure(
                Const.RATIO,
                Const.spreadFee,
                loanLimit,
                Const.DISCOUNT,
                Const.DAYS_5,
                minRatio,
                autoInvestMinAmount,
                Const.FALSE,
                Const.URL
            );

            // autoInvestMinAmount - lower
            await assets[4].connect(user).configure(
                Const.RATIO,
                Const.spreadFee,
                loanLimit,
                Const.DISCOUNT,
                Const.DAYS_5,
                minRatio,
                10e6,
                Const.TRUE,
                Const.URL
            );

            // autoInvestMinRatio - higher
            await assets[5].connect(user).configure(
                Const.RATIO,
                Const.spreadFee,
                loanLimit,
                Const.DISCOUNT,
                Const.DAYS_5,
                higherRatio,
                autoInvestMinAmount,
                Const.TRUE,
                Const.URL
            );

            // Set Balancer in the Sweep
            await sweep.setBalancer(balancer.address);
            user = await impersonate(addresses.owner);
            await sweep.setTreasury(TREASURY);

            // Add the assets to the minter list
            await Promise.all(
                assets.map(async (asset) => {
                    await sweep.addMinter(asset.address, maxBorrow);
                })
            );

            // Send USDC to Borrower
            user = await impersonate(addresses.usdc_e);
            await sendEth(user.address);
            await usdc.connect(user).transfer(BORROWER, usdxAmount);

            await usdc.connect(user).transfer(amm.address, usdxAmount*10);
            await sweep.transfer(amm.address, sweepAmount);
        });

        it('Sets a new loan limits correctly', async () => {
            expect(await assets[2].loanLimit()).to.equal(Const.ZERO);

            await expect(balancer.connect(lzEndpoint).setLoanLimit(assets[2].address, loanLimit))
                .to.be.revertedWithCustomError(balancer, "NotMultisigOrGov");

            await balancer.setLoanLimit(assets[2].address, loanLimit);
            expect(await assets[2].loanLimit()).to.equal(loanLimit);
        });

        it('Deposits and mints sweep', async () => {
            user = await impersonate(BORROWER);
            await Promise.all(
                assets.map(async (asset) => {
                    await usdc.connect(user).transfer(asset.address, depositAmount);
                })
            );

            // Mint
            await Promise.all(
                assets.map(async (asset) => {
                    await asset.connect(user).borrow(mintAmount);
                })
            );

            await Promise.all(
                assets.map(async (asset) => {
                    expect(await asset.sweepBorrowed()).to.equal(mintAmount);
                })
            );
        });

        it('Sell sweep and invest usdc', async () => {
            await Promise.all(
                assets.map(async (asset) => {
                    await asset.connect(user).sellSweepOnAMM(mintAmount, Const.ZERO);
                })
            );

            await Promise.all(
                assets.map(async (asset) => {
                    expect(await sweep.balanceOf(asset.address)).to.equal(Const.ZERO);
                    expect(await usdc.balanceOf(asset.address)).to.above(depositAmount);
                })
            );

            // Invests
            await Promise.all(
                assets.map(async (asset) => {
                    await asset.connect(user).invest(usdxAmount);
                })
            )
            expect(await usdc.balanceOf(assets[0].address)).to.equal(Const.ZERO);
            await Promise.all(
                assets.map(async (asset) => {
                    expect(await usdc.balanceOf(asset.address)).to.equal(Const.ZERO);
                })
            );
        });

        it('autoinvest constraints', async () => {
            await expect(assets[0].autoInvest(mintAmount, 1e6, 2000))
                .to.be.revertedWithCustomError(AaveAsset, "NotBalancer");

            // autoInvest - false
            await balancer.addActions([assets[3].address], [mintAmount]);
            await expect(balancer.execute(1, true, 1e6, 2000))
                .to.be.revertedWithCustomError(AaveAsset, "NotAutoInvest");
            
            await balancer.reset();
            // autoInvestMinAmount - lower
            await balancer.addActions([assets[4].address], [9e6]);
            await expect(balancer.execute(1, true, 1e6, 2000))
                .to.be.revertedWithCustomError(AaveAsset, "NotAutoInvestMinAmount");

            await balancer.reset();
            // autoInvestMinRatio - higher
            await balancer.addActions([assets[5].address], [mintAmount]);
            await expect(balancer.execute(1, true, 1e6, 2000))
                .to.be.revertedWithCustomError(AaveAsset, "NotAutoInvestMinRatio");
        });

        it('Call auto invests in the Balancer', async () => {
            await balancer.reset();
            targets = assets.filter((_, index) => index < 3).map(asset => asset.address)
            investAmount = toBN("45", 18); // 45 Sweep more
            amounts = [investAmount, investAmount, investAmount]; // 45 Sweep to each stabilizer

            expectedAmount = toBN("545", 18); // mintAmount(500) + amount(45) = 545

            await balancer.addActions(targets, amounts);
            await balancer.execute(1, true, 1e6, 2000); // 1 => invests, force: true, 1 => price, 2000 => slippage

            expect(await assets[0].sweepBorrowed()).to.eq(expectedAmount);
            expect(await assets[1].sweepBorrowed()).to.eq(expectedAmount);
            expect(await assets[2].sweepBorrowed()).to.eq(expectedAmount);
        });
    });
});

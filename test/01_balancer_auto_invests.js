const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { impersonate, Const, toBN } = require("../utils/helper_functions");

contract('Balancer - Auto Invests', async () => {
    before(async () => {
        [owner, lzEndpoint] = await ethers.getSigners();
        // Variables
        BORROWER = addresses.borrower;
        USDC_ADDRESS = addresses.usdc;
        TREASURY = addresses.treasury;
        OWNER = addresses.owner;
        usdxAmount = 1000e6;
        depositAmount = 10e6;
        sweepAmount = toBN("1000", 18);
        maxBorrow = toBN("100", 18);
        loanLimit = toBN("80", 18);
        mintAmount = toBN("50", 18);
        autoInvestMinAmount = toBN("10", 18);
        minRatio = 5e4; // 5%

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
        balancer = await Balancer.deploy(sweep.address);

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(amm.address);

        AaveAsset = await ethers.getContractFactory("AaveV3Asset");
        assets = await Promise.all(
            Array(3).fill().map(async () => {
                return await AaveAsset.deploy(
                    'Aave Asset',
                    sweep.address,
                    USDC_ADDRESS,
                    addresses.aave_usdc,
                    addresses.aaveV3_pool,
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
            user = await impersonate(USDC_ADDRESS);
            await usdc.connect(user).transfer(BORROWER, usdxAmount);

            await usdc.connect(user).transfer(amm.address, usdxAmount);
            await sweep.transfer(amm.address, sweepAmount);
        });

        it('Sets a new loan limits correctly', async () => {
            expect(await assets[2].loanLimit()).to.equal(Const.ZERO);

            await expect(balancer.connect(lzEndpoint).setLoanLimit(assets[2].address, loanLimit))
                .to.be.revertedWithCustomError(balancer, "NotMultisig");

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

        it('Call auto invests in the Balancer', async () => {
            targets = assets.map((asset) => { return asset.address });
            investAmount = toBN("45", 18); // 45 Sweep more
            amounts = [investAmount, investAmount, investAmount]; // 45 Sweep to each stabilizer

            expectedAmount = toBN("95", 18); // mintAmount(50) + amount(45) = 95
            expectedLimit = toBN("125", 18); // oldLimit(80) + amount(45) = 125

            await balancer.addActions(targets, amounts);
            await balancer.execute(1, true, 1e6, 2000); // 1 => invests, force: true, 1 => price, 2000 => slippage

            expect(await assets[0].sweepBorrowed()).to.eq(expectedAmount);
            expect(await assets[1].sweepBorrowed()).to.eq(expectedAmount);
            expect(await assets[2].sweepBorrowed()).to.eq(expectedAmount);
            // expect(await assets[3].sweepBorrowed()).to.eq(expectedAmount);
            // expect(await assets[4].sweepBorrowed()).to.eq(expectedAmount);

            expect(await assets[0].loanLimit()).to.eq(expectedLimit);
            expect(await assets[1].loanLimit()).to.eq(expectedLimit);
            expect(await assets[2].loanLimit()).to.eq(expectedLimit);
            // expect(await assets[3].loanLimit()).to.eq(expectedLimit);
            // expect(await assets[4].loanLimit()).to.eq(expectedLimit);
        });
    });
});

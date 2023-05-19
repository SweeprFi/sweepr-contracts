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
            addresses.owner,
            addresses.approver,
            addresses.treasury,
            2500 // 0.25%
        ]);
        sweep = await Proxy.deployed();

        ERC20 = await ethers.getContractFactory("ERC20");
        usdc = await ERC20.attach(USDC_ADDRESS);

        Balancer = await ethers.getContractFactory("Balancer");
        balancer = await Balancer.deploy(sweep.address, USDC_ADDRESS, owner.address);

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, usdOracle.address, Const.ADDRESS_ZERO);

        AaveAsset = await ethers.getContractFactory("AaveV3Asset");
        assets = await Promise.all(
            Array(5).fill().map(async () => {
                return await AaveAsset.deploy(
                    'Aave Asset',
                    sweep.address,
                    USDC_ADDRESS,
                    addresses.aave_usdc,
                    addresses.aaveV3_pool,
                    amm.address,
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
                    if (index < 3) {
                        await asset.connect(user).configure(
                            Const.RATIO,
                            Const.SPREAD_FEE,
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

            // Auto invest is false.
            await assets[3].connect(user).configure(
                Const.RATIO,
                Const.SPREAD_FEE,
                loanLimit,
                Const.DISCOUNT,
                Const.DAYS_5,
                minRatio,
                autoInvestMinAmount,
                Const.FALSE,
                Const.URL
            );

            // Large auto invest amount.
            await assets[4].connect(user).configure(
                Const.RATIO,
                Const.SPREAD_FEE,
                loanLimit,
                Const.DISCOUNT,
                Const.DAYS_5,
                minRatio,
                loanLimit,
                Const.TRUE,
                Const.URL
            );

            // Set Balancer in the Sweep
            await sweep.setBalancer(balancer.address);

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
                    expect(await asset.sweep_borrowed()).to.equal(mintAmount);
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
            amount = toBN("125", 18); // 80 Sweep (old limit) -> 45 Sweep more
            updateAmount = toBN("95", 18); // mintAmount(50) + amount(45) = 95 SWEEP
            amounts = [amount, amount, amount, amount, amount]; // 45 Sweep to each stabilizer
            autoInvests = [Const.TRUE, Const.TRUE, Const.TRUE, Const.FALSE, Const.FALSE];

            await balancer.addLoanLimits(targets, amounts, autoInvests);
            await balancer.execute();

            expect(await assets[0].sweep_borrowed()).to.eq(updateAmount);
            expect(await assets[1].sweep_borrowed()).to.eq(updateAmount);
            expect(await assets[2].sweep_borrowed()).to.eq(updateAmount);
            expect(await assets[3].sweep_borrowed()).to.eq(mintAmount); // auto invest = false
            expect(await assets[4].sweep_borrowed()).to.eq(mintAmount); // minimum auto invest amount = 80 SWEEP
        });
    });
});

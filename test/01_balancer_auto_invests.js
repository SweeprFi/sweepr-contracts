const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');

contract('Balancer - Auto Invests', async () => {
    before(async () => {
        [lzEndpoint] = await ethers.getSigners();
        // Variables
        ZERO = 0;
        usdxAmount = 1000e6;
        sweepAmount = ethers.utils.parseUnits("1000", 18);
        maxBorrow = ethers.utils.parseUnits("100", 18);
        loanLimit = ethers.utils.parseUnits("80", 18);
        mintAmount = ethers.utils.parseUnits("50", 18);
        depositAmount = 10e6;
        minEquityRatio = 10e4; // 10%
        spreadFee = 3e4; // 3%
        liquidatorDiscount = 2e4; // 2%
        callDelay = 432000; // 5 days
        autoInvestMinEquityRatio = 5e4; // 5%
        autoInvestMinAmount = ethers.utils.parseUnits("10", 18);
        autoInvest = true;
        link = "htttp://test.com";
        BORROWER = addresses.borrower;
        USDC_ADDRESS = addresses.usdc;
        TREASURY = addresses.treasury;
        // Deploys
        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
        sweep = await Proxy.deployed();

        ERC20 = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
        usdc = await ERC20.attach(USDC_ADDRESS);

        Balancer = await ethers.getContractFactory("Balancer");
        balancer = await Balancer.deploy(sweep.address, USDC_ADDRESS);

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address);

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
                    BORROWER,
                    usdOracle.address
                );
            })
        )
    });

    async function impersonate(address) {
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [address]
        });

        user = await ethers.getSigner(address);
    }

    describe('Auto invests - Balancer & Stabilizers', async () => {
        it('Config the initial state', async () => {
            // config the assets
            await impersonate(BORROWER);
            await Promise.all(
                assets.map(async (asset, index) => {
                    if (index < 3) {
                        await asset.connect(user).configure(
                            minEquityRatio,
                            spreadFee,
                            loanLimit,
                            liquidatorDiscount,
                            callDelay,
                            autoInvestMinEquityRatio,
                            autoInvestMinAmount,
                            autoInvest,
                            link
                        );
                    }
                })
            );

            // Auto invest is false.
            await assets[3].connect(user).configure(
                minEquityRatio,
                spreadFee,
                loanLimit,
                liquidatorDiscount,
                callDelay,
                autoInvestMinEquityRatio,
                autoInvestMinAmount,
                false,
                link
            );

            // Large auto invest amount.
            await assets[4].connect(user).configure(
                minEquityRatio,
                spreadFee,
                loanLimit,
                liquidatorDiscount,
                callDelay,
                autoInvestMinEquityRatio,
                loanLimit,
                autoInvest,
                link
            );

            // Set Balancer in the Sweep
            await sweep.setBalancer(balancer.address);
            await sweep.setTreasury(TREASURY);

            // Add the assets to the minter list
            await Promise.all(
                assets.map(async (asset) => {
                    await sweep.addMinter(asset.address, maxBorrow);
                })
            );

            // Send USDC to Borrower
            await impersonate(USDC_ADDRESS);
            await usdc.connect(user).transfer(BORROWER, usdxAmount);

            await usdc.connect(user).transfer(amm.address, usdxAmount);
            await sweep.transfer(amm.address, sweepAmount);
        });

        it('Deposits and mints sweep', async () => {
            await impersonate(BORROWER);
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
                    await asset.connect(user).sellSweepOnAMM(mintAmount, 0);
                })
            );

            await Promise.all(
                assets.map(async (asset) => {
                    expect(await sweep.balanceOf(asset.address)).to.equal(ZERO);
                    expect(await usdc.balanceOf(asset.address)).to.above(depositAmount);
                })
            );

            // Invests
            await Promise.all(
                assets.map(async (asset) => {
                    await asset.connect(user).invest(usdxAmount);
                })
            )
            expect(await usdc.balanceOf(assets[0].address)).to.equal(ZERO);
            await Promise.all(
                assets.map(async (asset) => {
                    expect(await usdc.balanceOf(asset.address)).to.equal(ZERO);
                })
            );
        });

        it('Call auto invests in the Balancer', async () => {
            targets = assets.map((asset) => { return asset.address });
            updateAmount = ethers.utils.parseUnits("95", 18); // mintAmount(50) + amount(45) = 95 SWEEP
            amount = ethers.utils.parseUnits("45", 18);
            amounts = [amount, amount, amount, amount, amount]; // 45 Sweep to each stabilizer

            await balancer.autoInvests(targets, amounts);

            expect(await assets[0].sweep_borrowed()).to.eq(updateAmount);
            expect(await assets[1].sweep_borrowed()).to.eq(updateAmount);
            expect(await assets[2].sweep_borrowed()).to.eq(updateAmount);
            expect(await assets[3].sweep_borrowed()).to.eq(mintAmount); // auto invest = false
            expect(await assets[4].sweep_borrowed()).to.eq(mintAmount); // minimum auto invest amount = 80 SWEEP
        });
    });
});

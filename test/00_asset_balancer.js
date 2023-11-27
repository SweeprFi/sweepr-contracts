const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { impersonate, sendEth, Const, toBN } = require("../utils/helper_functions");
let user;

contract("Balancer Asset", async function () {
    before(async () => {
        [borrower, other, treasury, lzEndpoint] = await ethers.getSigners();

        BORROWER = borrower.address;
        depositAmount = 1000e6;
        withdrawAmount = 7000e6;
        maxSweep = toBN("500000", 18);
        sweepAmount = toBN("5000", 18);
        POOL = addresses.balancer_pool;

        await sendEth(Const.WETH_HOLDER);
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
        pool = await Token.attach(POOL);

        Oracle = await ethers.getContractFactory("AggregatorMock");
        wethOracle = await Oracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, Const.FEE);

        BalancerAsset = await ethers.getContractFactory("BalancerAsset");
        balancer_asset = await BalancerAsset.deploy(
            'Balancer Asset',
            sweep.address,
            addresses.usdc,
            addresses.oracle_usdc_usd,
            POOL,
            BORROWER
        );

        await sendEth(addresses.usdc_holder);
        user = await impersonate(addresses.usdc_holder);
        await usdc.connect(user).transfer(balancer_asset.address, depositAmount);
        await usdc.connect(user).transfer(amm.address, depositAmount * 5);

        await sweep.addMinter(borrower.address, maxSweep);
        await sweep.setAMM(amm.address);
        await sweep.mint(maxSweep);
        await sweep.transfer(amm.address, sweepAmount);

        await sweep.addMinter(balancer_asset.address, maxSweep);
        await balancer_asset.configure(
            Const.RATIO, Const.FEE, maxSweep, Const.ZERO, Const.ZERO, Const.DAYS_5,
            Const.RATIO, maxSweep, Const.TRUE, Const.FALSE, Const.URL
        );
    });

    describe("invest and divest functions", async function () {
        it("invest correctly", async function () {
            expect(await balancer_asset.assetValue()).to.equal(Const.ZERO);
            expect(await usdc.balanceOf(balancer_asset.address)).to.greaterThan(Const.ZERO);
            expect(await pool.balanceOf(balancer_asset.address)).to.equal(Const.ZERO);

            borrowAmount = toBN("4000", 18);
            await balancer_asset.oneStepInvest(borrowAmount, 2000, true);
            balanceBefore = await pool.balanceOf(balancer_asset.address);

            expect(balanceBefore).to.greaterThan(Const.ZERO);
            expect(await balancer_asset.assetValue()).to.greaterThan(Const.ZERO);

            await balancer_asset.invest(depositAmount, 2000);
            expect(await usdc.balanceOf(balancer_asset.address)).to.equal(Const.ZERO);
            expect(await pool.balanceOf(balancer_asset.address)).to.greaterThan(balanceBefore);
        });

        it("divest correctly", async function () {
            assetValue = await balancer_asset.assetValue();
            currentValue = await balancer_asset.currentValue();
            expect(assetValue).to.equal(currentValue);

            await balancer_asset.oneStepDivest(withdrawAmount, 2000, true);

            assetValue = await balancer_asset.assetValue();
            balance = await usdc.balanceOf(balancer_asset.address);
            // expect(balance).to.greaterThan(Const.ZERO);
            expect(await balancer_asset.currentValue()).to.greaterThan(assetValue);

            await balancer_asset.divest(withdrawAmount, 150);
            expect(await usdc.balanceOf(balancer_asset.address)).to.greaterThan(balance);
            expect(await balancer_asset.assetValue()).to.below(assetValue);
        });
    });
});

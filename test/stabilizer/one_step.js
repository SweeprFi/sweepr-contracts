const { expect } = require("chai");
const { ethers } = require("hardhat");
const { chainlink, uniswap, tokens, wallets } = require("../../utils/constants");
const { impersonate, sendEth, Const, toBN } = require("../../utils/helper_functions");
let user;

contract("Stabilizer - One step invest/divest", async function () {
    before(async () => {
        [owner, other, treasury, lzEndpoint] = await ethers.getSigners();

        BORROWER = owner.address;
        depositAmount = 1000e6;
        withdrawAmount = 1000e6;
        maxSweep = toBN("500000", 18);
        sweepAmount = toBN("5000", 18);
        maxWeth = toBN("5000", 18);

        await sendEth(Const.WETH_HOLDER);
        // ------------- Deployment of contracts -------------
        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, owner.address, 2500]);
        sweep = await Proxy.deployed();
        await sweep.setTreasury(treasury.address);

        Token = await ethers.getContractFactory("ERC20");
        usdc = await Token.attach(tokens.usdc);
        weth = await Token.attach(tokens.weth);

        Oracle = await ethers.getContractFactory("AggregatorMock");
        wethOracle = await Oracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, owner.address);
        await sweep.setAMM(amm.address);

        WETHAsset = await ethers.getContractFactory("ERC20Asset");
        weth_asset = await WETHAsset.deploy(
            'WETH Asset',
            sweep.address,
            tokens.usdc,
            tokens.weth,
			chainlink.usdc_usd,
            wethOracle.address,
            BORROWER,
            uniswap.pool_weth
        );

        await sendEth(wallets.usdc_holder);
        user = await impersonate(wallets.usdc_holder);
        await usdc.connect(user).transfer(weth_asset.address, depositAmount);
        await usdc.connect(user).transfer(amm.address, depositAmount * 5);

        await sweep.addMinter(owner.address, maxSweep);
        await sweep.mint(maxSweep);
        await sweep.transfer(amm.address, sweepAmount);
        
        user = await impersonate(Const.WETH_HOLDER);
        await weth.connect(user).transfer(amm.address, maxWeth);

        await sweep.addMinter(weth_asset.address, maxSweep);
        await weth_asset.configure(
            Const.RATIO, 500, maxSweep, Const.ZERO, Const.ZERO, Const.DAYS_5,
            Const.RATIO, maxSweep, Const.TRUE, Const.FALSE, Const.URL
        );
    });

    describe("invest and divest functions", async function () {
        it("invest correctly", async function () {
            expect(await weth_asset.assetValue()).to.equal(Const.ZERO);
            expect(await usdc.balanceOf(weth_asset.address)).to.greaterThan(Const.ZERO);
            expect(await weth.balanceOf(weth_asset.address)).to.equal(Const.ZERO);

            borrowAmount = toBN("1000", 18);
            await weth_asset.oneStepInvest(borrowAmount, 2000, true);
            balanceBefore = await weth.balanceOf(weth_asset.address);

            expect(balanceBefore).to.greaterThan(Const.ZERO);
            expect(await weth_asset.assetValue()).to.greaterThan(Const.ZERO);

            await weth_asset.invest(depositAmount, 2000);

            expect(await usdc.balanceOf(weth_asset.address)).to.equal(Const.ZERO);
            expect(await weth.balanceOf(weth_asset.address)).to.greaterThan(balanceBefore);
        });

        it("divest correctly", async function () {
            assetValue = await weth_asset.assetValue();
            currentValue = await weth_asset.currentValue();
            expect(assetValue).to.equal(currentValue);

            await weth_asset.oneStepDivest(withdrawAmount, 2000, true);

            assetValue = await weth_asset.assetValue();
            balance = await usdc.balanceOf(weth_asset.address);

            await weth_asset.divest(withdrawAmount, 150);
            
            expect(await usdc.balanceOf(weth_asset.address)).to.greaterThan(balance);
            expect(await weth_asset.assetValue()).to.below(assetValue);
        });
    });
});

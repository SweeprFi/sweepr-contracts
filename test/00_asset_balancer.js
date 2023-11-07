const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { impersonate, sendEth, Const, toBN } = require("../utils/helper_functions");
let user;

contract.only("Balancer Asset", async function () {
    before(async () => {
        [borrower, other, treasury, lzEndpoint] = await ethers.getSigners();

        BORROWER = borrower.address;
        depositAmount = 10000e6;
        withdrawAmount = 100000e6;
        maxSweep = toBN("500000", 18);
        maxBorrow = toBN("100", 18);

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

        pool = await Token.attach("0x423A1323c871aBC9d89EB06855bF5347048Fc4A5");

        Oracle = await ethers.getContractFactory("AggregatorMock");
        wethOracle = await Oracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(amm.address);

        // await amm.setPrice(Const.WETH_AMM);
        // await wethOracle.setPrice(Const.WETH_PRICE);

        BalancerAsset = await ethers.getContractFactory("BalancerAsset");
        balancer_asset = await BalancerAsset.deploy(
            'Balancer Asset',
            sweep.address,
            addresses.usdc,
			addresses.oracle_usdc_usd,
            BORROWER,
            "0x423A1323c871aBC9d89EB06855bF5347048Fc4A5"
        );

        await sendEth(addresses.usdc_holder);
        user = await impersonate(addresses.usdc_holder);
        await usdc.connect(user).transfer(balancer_asset.address, depositAmount);

    });

    describe("invest and divest functions", async function () {

        it("invest correctly", async function () {
            // expect(await balancer_asset.assetValue()).to.equal(Const.ZERO);
            const usdcBalance = await usdc.balanceOf(balancer_asset.address);
            const bpg4poolBalance = await pool.balanceOf(balancer_asset.address);
            
            console.log("USDC:", usdcBalance);
            console.log("BPT:", bpg4poolBalance);
            console.log("Asset Value (USD):", await balancer_asset.currentValue());
            
            await balancer_asset.invest(depositAmount, Const.SLIPPAGE);
            const usdcBalance1 = await usdc.balanceOf(balancer_asset.address);
            const bpg4poolBalance1 = await pool.balanceOf(balancer_asset.address);
            
            console.log("------------------------------------------------------")
            console.log("USDC:", usdcBalance1);
            console.log("BPT:", bpg4poolBalance1);
            console.log("Asset Value (USD):", await balancer_asset.currentValue());

            await balancer_asset.divest(withdrawAmount, Const.SLIPPAGE);
            const usdcBalance2 = await usdc.balanceOf(balancer_asset.address);
            const bpg4poolBalance2 = await pool.balanceOf(balancer_asset.address);

            console.log("------------------------------------------------------")
            console.log("USDC:", usdcBalance2);
            console.log("BPT:", bpg4poolBalance2);
            console.log("Asset Value (USD):", await balancer_asset.currentValue());
        });
    });
});

const { ethers } = require("hardhat");
const { networks } = require("../../hardhat.config");
const { addresses } = require('../../utils/address');
const helpers = require("@nomicfoundation/hardhat-network-helpers");

let user;
let amount;
let ammPrice;
let index = 0;
let blockNumber;
const MAX_ROUNDS = 15;

async function binary_search() {
    // contracts
    [tester] = await ethers.getSigners();

    const ETH = ethers.utils.parseUnits("1", 18);
    const DEC = ethers.utils.parseUnits("1", 6);
    const SWEEP_AMOUNT = ethers.utils.parseUnits("5000", 18);
    const USDC_AMOUNT = ethers.utils.parseUnits("5000", 6);

    amm = await ethers.getContractAt("UniswapAMM", addresses.uniswap_amm);
    sweep = await ethers.getContractAt("SweepDollarCoin", addresses.sweep);
    usdc = await ethers.getContractAt("contracts/Common/ERC20/ERC20.sol:ERC20", addresses.usdc);

    const sweepOwner = await sweep.owner();
    let sweepBalance = await sweep.balanceOf(addresses.uniswap_pool);
    let usdcBalance = await usdc.balanceOf(addresses.uniswap_pool);

    usdcBalance = await sweep.convertToSWEEP(usdcBalance);
    sweepBalance = sweepBalance.div(ETH);
    usdcBalance = usdcBalance.div(ETH);

    const targetPrice = await sweep.target_price();
    let arbSpread = await sweep.arb_spread();

    if (arbSpread == 0) arbSpread = ethers.utils.parseUnits("1", 3); //~> simulated 0.1% - now it is zero in Arbitrum

    const maxPrice = (DEC).add(arbSpread).mul(targetPrice).div(DEC);
    const minPrice = (DEC).sub(arbSpread).mul(targetPrice).div(DEC);
    // =================== impersonate accounts ===================
    async function impersonate(account) {
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [account]
        });
        user = await ethers.getSigner(account);
    }
    // =================== sends ETH to accounts ===================
    async function sendETH(account) {
        await hre.network.provider.request({
            method: "hardhat_setBalance",
            params: [account, ethers.utils.parseEther('5').toHexString()]
        });
    }
    // =================== sends balances to the Tester ===================
    async function sendBalance() {
        await impersonate(addresses.usdc);
        await usdc.connect(user).transfer(tester.address, USDC_AMOUNT);

        await impersonate(sweepOwner);
        await sweep.connect(user).addMinter(tester.address, SWEEP_AMOUNT);
        // sets a lower target price to can mint more Sweep
        await sweep.connect(user).setTargetPrice(100, 100);
        await sweep.minter_mint(tester.address, SWEEP_AMOUNT);

        await sweep.approve(addresses.uniswap_amm, SWEEP_AMOUNT);
        await usdc.approve(addresses.uniswap_amm, USDC_AMOUNT);
    }
    // =================== reset the local fork state ===================
    async function resetNetwork() {
        if (!blockNumber) {
            url = networks.hardhat.forking.url;
            blockNumber = await ethers.provider.getBlockNumber();
        } else {
            await helpers.reset(url, blockNumber);
        }

        await sendETH(sweepOwner);
        await sendETH(addresses.usdc);
        await sendBalance();
    }
    // =================== logs ===================
    function logs(attemp, amount, price) {
        console.log(`Attemp ${attemp}: ${amount} SWEEP ~> New AMM Price: ${price}`);
    }
    // =================== sells sweep on AMM ===================
    async function sellSweep() {
        min = 0;
        max = usdcBalance;
        X = max / 2;

        while (index < MAX_ROUNDS) {
            _amount = ethers.utils.parseUnits(X + "", 18);
            await amm.sellSweep(addresses.usdc, _amount, 0);

            if (ammPrice.gt(maxPrice)) {
                max = X;
                X = (X + min) / 2;
            } else if (ammPrice.lt(minPrice)) {
                min = X;
                X = (X + max) / 2;
            } else {
                amount = X;
                break;
            }

            ammPrice = await sweep.amm_price();
            index++;
            logs(index, X, ammPrice);
            await resetNetwork();
        }
    }
    // =================== buys sweep on AMM ===================
    async function buySweep() {
        min = 0;
        max = sweepBalance;
        X = max / 2;

        while (index < MAX_ROUNDS) {
            _amount = ethers.utils.parseUnits(X + "", 6);
            await amm.buySweep(addresses.usdc, _amount, 0);

            if (ammPrice.gt(maxPrice)) {
                min = X;
                X = (X + max) / 2;
            } else if (ammPrice.lt(minPrice)) {
                max = X;
                X = (X + min) / 2;
            } else {
                amount = X;
                break;
            }

            ammPrice = await sweep.amm_price();
            index++;
            logs(index, X, ammPrice);
            await resetNetwork();
        }
    }
    // =================== main function ===================
    await resetNetwork();
    ammPrice = await sweep.amm_price();

    console.log(`TARGET PRICE: [ ${minPrice} - ${maxPrice} ] `);
    console.log(`AMM PRICE: ${ammPrice}`);

    if (sweepBalance > usdcBalance) {
        console.log("\nThe balancer needs to BUY -X- SWEEP from the AMM.");
        await buySweep();
    } else {
        console.log("\nThe balancer needs to SELL -X- SWEEP to the AMM.");
        await sellSweep();
    }

    console.log(`X = ${amount} SWEEP`);
};

binary_search();

/*
How to run:
    npx hardhat --network hardhat run scripts/sweep/binary_search.js
*/

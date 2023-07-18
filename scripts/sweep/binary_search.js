/*
** How to run:
** npx hardhat --network hardhat run scripts/sweep/binary_search.js
*/

const { ethers } = require("hardhat");
const { networks } = require("../../hardhat.config");
const { addresses } = require('../../utils/address');
const { impersonate, sendEth } = require("../../utils/helper_functions");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

let user;
let blockNumber;
const MAX_ROUNDS = 15;

async function binary_search() {
    // contracts
    [tester] = await ethers.getSigners();

    const ETH = ethers.utils.parseUnits("1", 18);
    const SWEEP_AMOUNT = ethers.utils.parseUnits("50000", 18);
    const USDC_AMOUNT = ethers.utils.parseUnits("50000", 6);

    amm = await ethers.getContractAt("UniswapAMM", addresses.uniswap_amm);
    sweep = await ethers.getContractAt("SweepCoin", addresses.sweep);
    usdc = await ethers.getContractAt("ERC20", addresses.usdc);

    const SWEEP_OWNER = await sweep.owner();
    const BALANCER = await sweep.balancer();

    let sweepBalance = await sweep.balanceOf(addresses.uniswap_pool);
    let usdcBalance = await usdc.balanceOf(addresses.uniswap_pool);

    usdcBalance = await sweep.convertToSWEEP(usdcBalance);
    sweepBalance = sweepBalance.div(ETH);
    usdcBalance = usdcBalance.div(ETH);

    const targetPrice = await sweep.targetPrice(); // to simulate other target price: ethers.utils.parseUnits("1002800", 0);
    let arbSpread = await sweep.arbSpread();
    if (arbSpread == 0) arbSpread = ethers.utils.parseUnits("1000", 0); //~> simulated 0.1% - now it is zero in Arbitrum

    const spread = targetPrice.mul(arbSpread).div(1e6);
    const maxPrice = targetPrice.add(spread);
    const minPrice = targetPrice.sub(spread);

    // MAIN PROCESS ===============================================================================
    await resetNetwork();
    const ammPrice = await sweep.ammPrice();

    console.log(`TARGET PRICE: [ ${minPrice} - ${maxPrice} ] `);
    console.log(`AMM PRICE: ${ammPrice}`);

    const zero = ethers.BigNumber.from(0);
    const bound = sweepBalance.add(usdcBalance);

    if (ammPrice.gt(maxPrice)) {
        console.log("\nThe balancer needs to SELL [X] SWEEP to the AMM.");
        const amount = await simulate(amm.sellSweep, 18, bound, zero);
        console.log(`X = SELL ${amount} SWEEP`);
        return;
    }

    if(ammPrice.lt(minPrice)) {
        console.log("\nThe balancer needs to BUY [X] SWEEP from the AMM.");
        const amount = await simulate(amm.buySweep, 6, zero, bound);
        console.log(`X = BUY ${amount} SWEEP`);
        return;
    }

    console.log("Nothing to do. AMM price is between the targetPrice +/- arbSpread range");

    // FUNCTIONS =================================================================================

    // =================== simulates swaps in the AMM ===================
    async function simulate(swap, decimals, min, max) {
        let X = min.add(max).div(2);

        for( let i=0; i<MAX_ROUNDS; i++ ) {
            const swap_amount = ethers.utils.parseUnits(X.toString(), decimals);
            await swap(addresses.usdc, swap_amount, 0);
            const ammPrice = await sweep.ammPrice();
            console.log(`Attemp ${i}: ${X} SWEEP ~> New AMM Price: ${ammPrice}`);

            if (ammPrice.gt(maxPrice)) {
                max = X;
                X = X.add(min).div(2);
            } else if (ammPrice.lt(minPrice)) {
                min = X;
                X = X.add(max).div(2);
            } else {
                return X;
            }

            await resetNetwork();
        }
    }
    // =================== reset the local fork state ===================
    async function resetNetwork() {
        if (!blockNumber) {
            url = networks.hardhat.forking.url;
            blockNumber = await ethers.provider.getBlockNumber();
        } else {
            await helpers.reset(url, blockNumber);
        }

        await sendEth(SWEEP_OWNER);
        await sendEth(BALANCER);
        // await sendEth(addresses.usdc);
        await sendBalance();
    }
    // =================== sends balances to the Tester ===================
    async function sendBalance() {
        user = await impersonate(SWEEP_OWNER);
        await usdc.connect(user).transfer(tester.address, USDC_AMOUNT);
        await sweep.connect(user).addMinter(tester.address, SWEEP_AMOUNT);
        // sets a lower target price to can mint more Sweep
        user = await impersonate(BALANCER);
        await sweep.connect(user).setTargetPrice(100, 100);
        await sweep.connect(tester).mint(SWEEP_AMOUNT);

        await sweep.approve(addresses.uniswap_amm, SWEEP_AMOUNT.mul(100));
        await usdc.approve(addresses.uniswap_amm, USDC_AMOUNT.mul(100));
    }
};

binary_search();

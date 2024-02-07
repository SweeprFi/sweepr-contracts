const { ethers } = require("hardhat");
const { network, tokens, chainlink, baseswap, deployments } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();

    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const oracle = chainlink.usdc_usd;;
    const frequency = 86400;
    const sequencer = chainlink.sequencer;
    const helper = deployments.liquidity_helper;
    const pool = deployments.baseswap_pool;
    const router = baseswap.router;

    console.log("===========================================");
    console.log("BASESWAP AMM PLUGIN DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("SWEEP:", sweep);
    console.log("USDC:", usdc);
    console.log("Sequencer:", sequencer);
    console.log("Pool:", pool);
    console.log("USDC/USD Chainlink Oracle:", oracle);
    console.log("Oracle Frequency:", frequency);
    console.log("Liquidity helper:", helper);
    console.log("Baseswap Router:", router);
    console.log("===========================================");
    const answer = (await ask("continue? y/n: "));
    if (answer !== 'y') { process.exit(); }
    console.log("Deploying...");

    const AMMInstance = await ethers.getContractFactory("BaseswapAMM");
    const amm = await AMMInstance.deploy(sweep, usdc, sequencer, pool, oracle, frequency, helper, router);

    console.log("===========================================");
    console.log(`BaseswapAMM Deployed to:${amm.address}`);
    console.log(`\nnpx hardhat verify --network ${network.name} ${amm.address} ${sweep} ${usdc} ${sequencer} ${pool} ${oracle} ${frequency} ${helper} ${router}`);
}

main();
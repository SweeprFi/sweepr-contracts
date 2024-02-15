const { ethers } = require("hardhat");
const { network, tokens, chainlink, trader_joe, deployments } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();

    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const sequencer = chainlink.sequencer;
    const oracle = chainlink.usdc_usd;;
    const frequency = 86400;
    const router = trader_joe.router;
    const pool = deployments.trader_joe_pool;
    const quoter = deployments.trader_joe_quoter;

    console.log("===========================================");
    console.log("TRADER JOR AMM PLUGIN DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("SWEEP:", sweep);
    console.log("USDC:", usdc);
    console.log("Sequencer:", sequencer);
    console.log("USDC/USD Chainlink Oracle:", oracle);
    console.log("Oracle Frequency:", frequency);
    console.log("TraderJoe Router:", router);
    console.log("Pool:", pool);
    console.log("Quoter library:", quoter);
    console.log("===========================================");
    const answer = (await ask("continue? y/n: "));
    if (answer !== 'y') { process.exit(); }
    console.log("Deploying...");

    const AMMInstance = await ethers.getContractFactory("TraderJoeAMM");
    const amm = await AMMInstance.deploy(sweep, usdc, sequencer, oracle, frequency, router, pool, quoter);

    console.log("===========================================");
    console.log(`TraderJoeAMM Deployed to:${amm.address}`);
    console.log(`\nnpx hardhat verify --network ${network.name} ${amm.address} ${sweep} ${usdc} ${sequencer} ${oracle} ${frequency} ${router} ${pool} ${quoter}`);
}

main();
const { ethers } = require("hardhat");
const { network, tokens, chainlink, deployments } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();

    const sweep = tokens.sweep;
    const base = tokens.usdt;
    const oracle = chainlink.usdt_usd;;
    const frequency = 86400;
    const sequencer = chainlink.sequencer;
    const helper = deployments.liquidity_helper;
    const pool = deployments.pancake_pool;
    const router = pancake.router;

    console.log("===========================================");
    console.log("PANCAKE AMM PLUGIN DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("SWEEP:", sweep);
    console.log("USDT:", base);
    console.log("Sequencer:", sequencer);
    console.log("POOL:", pool);
    console.log("USDT/USD Chainlink Oracle:", oracle);
    console.log("Oracle Frequency:", frequency);
    console.log("Liquidity helper:", helper);
    console.log("Pancake Router:", router);
    console.log("===========================================");
    const answer = (await ask("continue? y/n: "));
    if (answer !== 'y') { process.exit(); }
    console.log("Deploying...");

    const pancakeAMMInstance = await ethers.getContractFactory("PancakeAMM");
    const amm = await pancakeAMMInstance.deploy(sweep, base, sequencer, pool, oracle, frequency, helper);

    console.log("===========================================");
    console.log(`PancakeAMM Deployed to:${amm.address}`);
    console.log(`\nnpx hardhat verify --network ${network.name} ${amm.address} ${sweep} ${base} ${sequencer} ${pool} ${oracle} ${frequency} ${helper} ${router}`);
}

main();
const { ethers } = require("hardhat");
const { network, tokens, chainlink } = require("../../../utils/constants");
const { sleep, ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();
    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const oracle = chainlink.usdc_usd;
    const frequency = 86400;
    const sequencer = chainlink.sequencer;

    console.log("===========================================");
    console.log("BALANCER AMM PLUGIN DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("SWEEP:", sweep);
    console.log("USDC:", usdc);
    console.log("USDC/USD Chainlink Oracle:", oracle);
    console.log("Oracle Frequency:", frequency);
    console.log("Sequencer:", sequencer);
    console.log("===========================================");
    const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
    console.log("Deploying...");

    const balancerAMMInstance = await ethers.getContractFactory("BalancerAMM");
    const amm = await balancerAMMInstance.deploy(sweep, usdc, sequencer, oracle, frequency);

    console.log("===========================================");
    console.log(`BalancerAMM Deployed to:${amm.address}`);
    console.log(`\nnpx hardhat verify --network ${network.name} ${amm.address} ${sweep} ${usdc} ${sequencer} ${oracle} ${frequency}`);
}

main();

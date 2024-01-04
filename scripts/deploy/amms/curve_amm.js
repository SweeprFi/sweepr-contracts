const { ethers } = require("hardhat");
const { network, tokens, chainlink } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();
    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const oracle = chainlink.usdc_usd;
    const frequency = 86400;
    const sequencer = chainlink.sequencer;

    console.log("===========================================");
    console.log("CURVE AMM PLUGIN DEPLOY");
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

    const AMM = await ethers.getContractFactory("CurveAMM");
    const amm = await AMM.deploy(sweep, usdc, sequencer, oracle, frequency);

    console.log("===========================================");
    console.log(`CurveAMM Deployed to:${amm.address}`);
    console.log(`\nnpx hardhat verify --network ${network.name} ${amm.address} ${sweep} ${usdc} ${sequencer} ${oracle} ${frequency}`);
}

main();

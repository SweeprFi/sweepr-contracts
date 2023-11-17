const { ethers } = require("hardhat");
const { addresses, network } = require("../../../utils/address");
const { sleep, Const } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();
    const sweep = addresses.sweep;
    const usdc = addresses.usdc;
    const oracle = addresses.oracle_usdc_usd;
    const frequency = 86400;
    const sequencer = addresses.sequencer_feed;
    const fee = Const.FEE;

    console.log("===========================================");
    console.log("UNISWAP AMM PLUGIN DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("SWEEP:", sweep);
    console.log("USDC:", usdc);
    console.log("USDC/USD Chainlink Oracle:", oracle);
    console.log("Oracle Frequency:", frequency);
    console.log("Sequencer:", sequencer);
    console.log("Fee:", fee);
    console.log("===========================================");
    console.log("Deploying in 5 seconds...");
    await sleep(5);
    console.log("Deploying...");


    const uniswapAMMInstance = await ethers.getContractFactory("UniswapAMM");
    const amm = await uniswapAMMInstance.deploy(sweep, usdc, sequencer, fee, oracle, frequency);

    console.log("===========================================");
    console.log(`UniswapAMM Deployed to:${amm.address}`);
    console.log(`\nnpx hardhat verify --network ${network.name} ${amm.address} ${sweep} ${usdc} ${sequencer} ${fee} ${oracle} ${frequency}`);

}

main();

const { ethers } = require("hardhat");
const { addresses } = require("../../../utils/address");
const { sleep } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();
    const assetName = 'Balancer Market Maker';
    const sweep = addresses.sweep;
    const usdc = addresses.usdc;
    const oracleUsdc = addresses.oracle_usdc_usd;
    const poolAddress = '0xD3f0A062c709dEd9C472438a9Ca46916e90A083B'; //addresses.balancer_pool;
    const borrower = addresses.multisig;


    console.log("===========================================");
    console.log("BALANCER MARKET MAKER ASSET DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("Asset Name:", assetName);
    console.log("SWEEP:", sweep);
    console.log("USDC:", usdc);
    console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
    console.log("poolAddress:", poolAddress);
    console.log("Borrower:", borrower);
    console.log("===========================================");
    console.log("Deploying in 5 seconds...");
    await sleep(5);
    console.log("Deploying...");


    const MarketMaker = await ethers.getContractFactory("BalancerMarketMaker");
    const stabilizer = await MarketMaker.deploy(
        assetName,
        sweep,
        usdc,
        oracleUsdc,
        poolAddress,
        borrower,
    );

    console.log("===========================================");
    console.log("MarketMaker deployed to: ", stabilizer.address);
    // console.log(`\nnpx hardhat verify --network ${network.name} ${stabilizer.address} "${assetName}" ${sweep} ${usdc} ${oracleUsdc} ${poolAddress} ${borrower}`)
}

main();


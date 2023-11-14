const { ethers } = require("hardhat");
const { addresses } = require("../../../utils/address");
const { sleep } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();
    const assetName = 'Uniswap Market Maker';
    const sweep = addresses.sweep;
    const usdc = addresses.usdc;
    const liquidityHelper = addresses.liquidity_helper;
    const topSpread = 500; // 0.05%
    const bottomSpread = 0; // 0
    const tickSpread = 1000; // 0.1%
    const oracleUsdc = addresses.oracle_usdc_usd;
    const borrower = addresses.multisig;


    console.log("===========================================");
    console.log("UNISWAP MARKET MAKER ASSET DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("Asset Name:", assetName);
    console.log("SWEEP:", sweep);
    console.log("USDC:", usdc);
    console.log("Liquidity Helper:", liquidityHelper);
    console.log("Top Spread:", topSpread);
    console.log("Bottom Spread:", bottomSpread);
    console.log("Tick Spread:", bottomSpread);
    console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
    console.log("Borrower:", borrower);
    console.log("===========================================");
    console.log("Deploying in 5 seconds...");
    await sleep(5);
    console.log("Deploying...");


    const MarketMaker = await ethers.getContractFactory("MarketMaker");
    const stabilizer = await MarketMaker.deploy(
        assetName,
        sweep,
        usdc,
        liquidityHelper,
        oracleUsdc,
        borrower,
        topSpread,
        bottomSpread,
        tickSpread
    );

    console.log("===========================================");
    console.log("MarketMaker deployed to: ", stabilizer.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${stabilizer.address} "${assetName}" ${sweep} ${usdc} ${liquidityHelper} ${oracleUsdc} ${borrower} ${topSpread} ${bottomSpread} ${tickSpread}`);
}

main();


const { ethers } = require("hardhat");
const { tokens, network, wallets, deployments, trader_joe, chainlink } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();
    const assetName = 'Trader Joe Market Maker';
    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const oracleUsdc = chainlink.usdc_usd;
    const pool = deployments.trader_joe_pool;
    const router = trader_joe.router;
    const borrower = wallets.multisig;

    console.log("===========================================");
    console.log("TRADER JOE MARKET MAKER ASSET DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("Asset Name:", assetName);
    console.log("SWEEP:", sweep);
    console.log("USDC:", usdc);
    console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
    console.log("Pool:", pool);
    console.log("TraderJoe Router:", router);
    console.log("Borrower:", borrower);
    console.log("===========================================");
    const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
    console.log("Deploying...");

    const MarketMaker = await ethers.getContractFactory("TraderJoeMarketMaker");
    const stabilizer = await MarketMaker.deploy(
        assetName,
        sweep,
        usdc,
        oracleUsdc,
        pool,
        router,
        borrower
    );

    console.log("===========================================");
    console.log("TraderJoeMarketMaker deployed to: ", stabilizer.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${stabilizer.address} "${assetName}" ${sweep} ${usdc} ${oracleUsdc} ${pool} ${router} ${borrower}`);
}

main();


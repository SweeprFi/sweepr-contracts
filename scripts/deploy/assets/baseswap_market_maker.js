const { ethers } = require("hardhat");
const { tokens, network, wallets, baseswap, chainlink } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();
    const assetName = 'Baseswap Market Maker';
    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const oracleUsdc = chainlink.usdc_usd;
    const positionManager = baseswap.positions_manager;
    const borrower = wallets.multisig;

    console.log("===========================================");
    console.log("BASESWAP MARKET MAKER ASSET DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("Asset Name:", assetName);
    console.log("SWEEP:", sweep);
    console.log("USDC:", usdc);
    console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
    console.log("USDC/USD Chainlink Oracle:", positionManager);
    console.log("Borrower:", borrower);
    console.log("===========================================");
    const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
    console.log("Deploying...");

    const MarketMaker = await ethers.getContractFactory("BaseswapMarketMaker");
    const stabilizer = await MarketMaker.deploy(
        assetName,
        sweep,
        usdc,
        oracleUsdc,
        positionManager,
        borrower
    );

    console.log("===========================================");
    console.log("MarketMaker deployed to: ", stabilizer.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${stabilizer.address} "${assetName}" ${sweep} ${usdc} ${oracleUsdc} ${positionManager} ${borrower}`);
}

main();

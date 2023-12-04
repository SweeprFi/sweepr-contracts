const { ethers } = require("hardhat");
const { addresses } = require("../../../utils/address");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();
    const assetName = 'Uniswap Market Maker';
    const sweep = addresses.sweep;
    const usdc = addresses.usdc;
    const liquidityHelper = addresses.liquidity_helper;
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
    console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
    console.log("Borrower:", borrower);
    console.log("===========================================");
    const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
    console.log("Deploying...");

    const MarketMaker = await ethers.getContractFactory("MarketMaker");
    const stabilizer = await MarketMaker.deploy(
        assetName,
        sweep,
        usdc,
        liquidityHelper,
        oracleUsdc,
        borrower
    );

    console.log("===========================================");
    console.log("MarketMaker deployed to: ", stabilizer.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${stabilizer.address} "${assetName}" ${sweep} ${usdc} ${liquidityHelper} ${oracleUsdc} ${borrower}`);
}

main();


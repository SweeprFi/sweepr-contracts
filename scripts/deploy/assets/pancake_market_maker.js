const { ethers } = require("hardhat");
const { network, tokens, chainlink, deployments, wallets } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();
    const assetName = 'Pancake Market Maker';
    const sweep = tokens.sweep;
    const base = tokens.usdt;
    const oracle = chainlink.usdt_usd;
    const borrower = wallets.multisig;

    console.log("===========================================");
    console.log("PANCAKE MARKET MAKER ASSET DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("Asset Name:", assetName);
    console.log("SWEEP:", sweep);
    console.log("USDC:", base);    
    console.log("BASE/USD Chainlink Oracle:", oracle);
    console.log("Borrower:", borrower);
    console.log("===========================================");
    const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
    console.log("Deploying...");

    const MarketMaker = await ethers.getContractFactory("PancakeMarketMaker");
    const stabilizer = await MarketMaker.deploy(
        assetName,
        sweep,
        base,
        oracle,
        borrower
    );

    console.log("===========================================");
    console.log("MarketMaker deployed to: ", stabilizer.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${stabilizer.address} "${assetName}" ${sweep} ${base} ${oracle} ${borrower}`);
}

main();


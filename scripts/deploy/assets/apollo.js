const { ethers } = require("hardhat");
const { tokens, network, wallets, protocols, chainlink } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();

    const name = 'ApolloX Asset';
    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const oracleUsdc = chainlink.usdc_usd;
    const borrower = wallets.borrower;

    console.log("===========================================");
	console.log("APOLLO ASSET DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("Asset Name:", name);
	console.log("SWEEP:", sweep);
	console.log("USDC:", usdc);
	console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
	console.log("Borrower:", borrower);
	console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Deploying...");

    const Asset = await ethers.getContractFactory("ApolloAsset");
    const asset = await Asset.deploy(
        name,
        sweep,
        usdc,
        oracleUsdc,
        borrower,
    );

    console.log("Apollo Asset deployed to:", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${oracleUsdc} ${borrower}`)

}

main();


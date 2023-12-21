const { ethers } = require("hardhat");
const { tokens, wallets, protocols, chainlink, network } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();

    const name = 'Aave V3 Asset';
    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const usdc_e = tokens.usdc_e;
    const pool = protocols.balancer.bpt_4pool;
    const aaveUsdc = protocols.aave.usdc;
    const aavePool = protocols.aave.pool;
    const oracleUsdc = chainlink.usdc_usd;
    const borrower = wallets.borrower;
    
    console.log("===========================================");
	console.log("AAVE ASSET DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("Asset Name:", name);
	console.log("SWEEP:", sweep);
	console.log("USDC:", usdc);
    console.log("USDC.e:", usdc_e);
    console.log("POOL:", pool);
    console.log("AAVE USDC:", aaveUsdc);
    console.log("AAVE POOL:", aavePool);
    console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
	console.log("Borrower:", borrower);
	console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Deploying...");


    const Asset = await ethers.getContractFactory("AaveAsset");
    const asset = await Asset.deploy(
        name,
        sweep,
        usdc,
        usdc_e,
        pool,
        aaveUsdc,
        aavePool,
        oracleUsdc,
        borrower
    );

    console.log("AaveAsset deployed to: ", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${usdc_e} ${pool} ${aaveUsdc} ${aavePool} ${oracleUsdc} ${borrower}`);
}

main();


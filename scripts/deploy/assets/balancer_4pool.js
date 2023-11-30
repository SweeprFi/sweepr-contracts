const { ethers } = require("hardhat");
const { tokens, wallets, protocols, chainlink, network } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();

    const name = 'Balancer 4Pool Asset';
    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const pool = protocols.balancer.bpt_4pool;
    const gauge = protocols.balancer.gauge_4pool;
    const oracleUsdc = chainlink.usdc_usd;
    const borrower = wallets.multisig;
    
    console.log("===========================================");
	console.log("BALANCER 4POOL ASSET DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("Asset Name:", name);
	console.log("SWEEP:", sweep);
	console.log("USDC:", usdc);
    console.log("POOL:", pool);
    console.log("GAUGE:", gauge);
    console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
	console.log("Borrower:", borrower);
	console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Deploying...");


    const Asset = await ethers.getContractFactory("Balancer4PoolAsset");
    const asset = await Asset.deploy(
        name,
        sweep,
        usdc,
        pool,
        gauge,
        oracleUsdc,
        borrower
    );

    console.log("Balancer Asset deployed to:", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${pool} ${gauge} ${oracleUsdc} ${borrower}`)
}

main();

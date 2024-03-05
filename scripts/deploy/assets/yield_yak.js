const { ethers } = require("hardhat");
const { tokens, wallets, yield_yak, chainlink, network } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();

    const name = 'Yield Yak Asset';
    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const oracleUsdc = chainlink.usdc_usd;
    const strategy = yield_yak.usdc_startegy;
    const borrower = wallets.borrower;
    
    console.log("===========================================");
	console.log("YIELD YAK ASSET DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("Asset Name:", name);
	console.log("SWEEP:", sweep);
	console.log("USDC:", usdc);
    console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
    console.log("Yield Yak Strategy:", strategy);
	console.log("Borrower:", borrower);
	console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Deploying...");

    YieldYakAsset = await ethers.getContractFactory("YieldYakAsset");
    asset = await YieldYakAsset.deploy(name, sweep, usdc, oracleUsdc, strategy, borrower);

    console.log("YieldYakAsset deployed to: ", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${oracleUsdc} ${strategy} ${borrower}`);
}

main();


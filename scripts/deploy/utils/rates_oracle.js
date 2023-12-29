const { ethers } = require("hardhat");
const { tokens, network } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
	[deployer] = await ethers.getSigners();
	const sweep = tokens.sweep;

	console.log("===========================================");
	console.log("RATES ORACLE DEPLOY"); 
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("SWEEP:", sweep);
	
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Creating...");

	const RatesOracle = await ethers.getContractFactory("RatesOracle");
	const ratesOracle = await RatesOracle.deploy(sweep);

	console.log("===========================================");
	console.log("Rates Oracle deployed to:", ratesOracle.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${ratesOracle.address} ${sweep}`);
}

main();

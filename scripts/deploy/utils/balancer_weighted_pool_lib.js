const { ethers } = require("hardhat");
const { network } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
	[deployer] = await ethers.getSigners();

	console.log("===========================================");
	console.log("WEIGHTED POOL LIBRARY DEPLOY"); 
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Creating...");

	const WeightedPoolLib = await ethers.getContractFactory("WeightedPoolLib");
    const quoterLib = await WeightedPoolLib.deploy();

	console.log("===========================================");
	console.log("Weighted Pool Library deployed to:", liquidityHelper.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${quoterLib.address}`);
}

main();

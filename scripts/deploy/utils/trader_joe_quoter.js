const { ethers } = require("hardhat");
const { network } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
	[deployer] = await ethers.getSigners();

	console.log("===========================================");
	console.log("TRADER JOE QUOTER LIBRARY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Creating...");

	const QuoterHelper = await ethers.getContractFactory("JoeQuoter");
	const quoterHelper = await QuoterHelper.deploy();

	console.log("===========================================");
	console.log("JT Quoter helper deployed to:", quoterHelper.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${quoterHelper.address}`);
}

main();

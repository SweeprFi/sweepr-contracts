const { ethers } = require("hardhat");
const { tokens, network } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
	[deployer] = await ethers.getSigners();
	const sweep = tokens.sweep;

	console.log("===========================================");
	console.log("TREASURY DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("SweepAddress:", sweep);
	console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
  	if(answer !== 'y'){ process.exit(); }
	console.log("Deploying...");


	const Treasury = await ethers.getContractFactory("Treasury");
	const treasury = await Treasury.deploy(sweep);

	console.log("===========================================");
	console.log(`Treasury Deployed to:${treasury.address}`);
	console.log(`\nnpx hardhat verify --network ${network.name} ${treasury.address} ${sweep}`);
}

main();

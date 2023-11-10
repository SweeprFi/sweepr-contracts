const { ethers } = require("hardhat");
const { addresses, network } = require("../../../utils/address");
const { sleep } = require("../../../utils/helper_functions");

async function main() {
	[deployer] = await ethers.getSigners();
	const sweep = addresses.sweep;

	console.log("===========================================");
	console.log("TREASURY DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("SweepAddress:", sweep);
	console.log("===========================================");
	console.log("Deploying in 5 seconds...");
	await sleep(5);
	console.log("Deploying...");


	const Treasury = await ethers.getContractFactory("Treasury");
	const treasury = await Treasury.deploy(sweep);

	console.log("===========================================");
	console.log(`Treasury Deployed to:${treasury.address}`);
	console.log(`\nnpx hardhat verify --network ${network.name} ${treasury.address} ${sweep}`);
}

main();

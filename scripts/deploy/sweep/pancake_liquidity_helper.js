const { ethers } = require("hardhat");
const { network } = require("../../../utils/address");
const { sleep } = require("../../../utils/helper_functions");

async function main() {
	[deployer] = await ethers.getSigners();

	
	console.log("===========================================");
	console.log("PANCAKE LIQUIDITY HELPER DEPLOY"); 
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("Deploying in 5 seconds...");
	await sleep(5);
	console.log("Deploying...");


	const LiquidityHelper = await ethers.getContractFactory("PancakeLiquidityHelper");
	const liquidityHelper = await LiquidityHelper.deploy();

	console.log("===========================================");
	console.log("Liquidity Helper deployed to:", liquidityHelper.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${liquidityHelper.address}`);
}

main();

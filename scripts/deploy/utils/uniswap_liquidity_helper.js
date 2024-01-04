const { ethers } = require("hardhat");
const { network } = require("../../../utils/address");
const { ask } = require("../../../utils/helper_functions");

async function main() {
	[deployer] = await ethers.getSigners();

	
	console.log("===========================================");
	console.log("LIQUIDITY HELPER DEPLOY"); 
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Creating...");


	const LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
	const liquidityHelper = await LiquidityHelper.deploy();

	console.log("===========================================");
	console.log("Liquidity Helper deployed to:", liquidityHelper.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${liquidityHelper.address}`);
}

main();

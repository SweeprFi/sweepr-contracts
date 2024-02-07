const { ethers } = require("hardhat");
const { network, uniswap } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
	[deployer] = await ethers.getSigners();

	const nftpm = uniswap.positions_manager;

	console.log("===========================================");
	console.log("UNISWAP LIQUIDITY HELPER DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("Position Manager:", nftpm);
	console.log("===========================================");
	
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Creating...");

	const LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
	const liquidityHelper = await LiquidityHelper.deploy(nftpm);

	console.log("===========================================");
	console.log("Liquidity Helper deployed to:", liquidityHelper.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${liquidityHelper.address} ${nftpm}`);
}

main();

const { ethers } = require("hardhat");
const { network, addresses } = require("../utils/address");

async function main() {
	let deployer = '';

	if (network.type === "0") { // local
		[deployer] = await ethers.getSigners();
		deployer = deployer.address;
	} else {
		deployer = addresses.owner;
	}

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	const LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
	const liquidityHelper = await LiquidityHelper.deploy();

	console.log("Liquidity Helper deployed to:", liquidityHelper.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${liquidityHelper.address}`);
}

main();
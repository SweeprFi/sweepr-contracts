const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
	[deployer] = await ethers.getSigners();
	deployer = deployer.address

	const assetName = 'Uniswap Asset';
	const sweep = addresses.sweep;
	const usdc = addresses.usdc;
	const helper = addresses.liquidity_helper;
	const borrower = addresses.multisig;

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	const UniV3AssetFactory = await ethers.getContractFactory("UniV3Asset");
	const UniV3Asset = await UniV3AssetFactory.deploy(assetName, sweep, usdc, helper, borrower);

	console.log("UniV3Asset deployed to: ", UniV3Asset.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${UniV3Asset.address} "${assetName}" ${sweep} ${usdc} ${helper} ${borrower}`);
}

main();



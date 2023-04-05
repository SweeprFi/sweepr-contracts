const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
	let deployer;
	const assetName = 'Uniswap Asset';
	const sweep = addresses.sweep;
	const usdc = addresses.usdc;
	const helper = addresses.liquidity_helper;
	const amm = addresses.uniswap_amm;
	const borrower = addresses.borrower;

	if (network.type === "0") { // local
		[owner] = await ethers.getSigners();
		deployer = owner.address
	} else {
		deployer = addresses.owner;
	}

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	const UniV3AssetFactory = await ethers.getContractFactory("UniV3Asset");
	const UniV3Asset = await UniV3AssetFactory.deploy(assetName, sweep, usdc, helper, amm, borrower);
	await UniV3Asset.deployed();

	console.log("UniV3Asset deployed to: ", UniV3Asset.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${UniV3Asset.address} "${assetName}" ${sweep} ${usdc} ${helper} ${amm} ${borrower}`);
}

main();



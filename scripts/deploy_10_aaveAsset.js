const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
	let deployer;
	assetName = 'Aave Asset';
	sweepAddress = addresses.sweep;
	usdcAddress = addresses.usdc;
	aaveUsdc = addresses.aave_usdc;
	aaveV2_pool = addresses.aaveV2_pool;
	borrower = addresses.borrower;

	if (network.type === "0") { // local
		[deployer] = await ethers.getSigners();
		deployer = deployer.address;
	} else {
		deployer = addresses.owner;
	}

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	AaveAssetFactory = await ethers.getContractFactory("AaveAsset");
	AaveAsset = await AaveAssetFactory.deploy(
		assetName,
		sweepAddress,
		usdcAddress,
		aaveUsdc,
		aaveV2_pool,
		borrower
	);

	console.log("AaveAsset deployed to: ", AaveAsset.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${AaveAsset.address} "${assetName}" ${sweepAddress} ${usdcAddress} ${aaveUsdc} ${aaveV2_pool} ${borrower}`);
}

main();

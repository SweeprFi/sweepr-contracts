const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
	[deployer] = await ethers.getSigners();
	deployer = deployer.address;

	const assetName = "Maple Asset";
	const sweep = addresses.sweep;
	const usdc = addresses.usdc;
	const maplePool = addresses.maple_usdc_pool;
	const oracleUsdc = addresses.oracle_usdc_usd;
	const withdrawalManager = addresses.maple_withdrawal_manager;	
	const borrower = addresses.multisig;

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	const Asset = await ethers.getContractFactory("MapleAsset");
	const asset = await Asset.deploy(
		assetName,
		sweep, // SWEEP
		usdc, // USDC
		maplePool, // MAPLE'S ERC4626 POOL
		oracleUsdc, // USDC-USD ORACLE
		withdrawalManager, // MAPLE WITHDRAWAL MANAGER
		borrower
	);

	console.log("Maple asset deployed to: ", asset.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${assetName}" ${sweep} ${usdc} ${maplePool} ${oracleUsdc} ${withdrawalManager} ${borrower}`);
}

main();



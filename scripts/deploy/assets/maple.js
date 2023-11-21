const { ethers } = require("hardhat");
const { tokens, chainlink, protocols, wallets, network } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
	[deployer] = await ethers.getSigners();

	const assetName = "Maple Asset";
	const sweep = tokens.sweep;
	const usdc = tokens.usdc;
	const oracleUsdc = chainlink.usdc_usd;
	const maplePool = protocols.maple.usdcPool;
	const withdrawalManager = protocols.maple.withdrawalManager;	
	const borrower = "0x51040d72Cf1ee780FFA5F7C7e9eDAb6E6091BCaA";

	
	console.log("===========================================");
    console.log("MAPLE ASSET DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("Asset Name:", assetName);
    console.log("SWEEP:", sweep);
    console.log("USDC:", usdc);
    console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
    console.log("Maple Pool:", maplePool);
    console.log("Withdrawal Manager:", withdrawalManager);
    console.log("Borrower:", borrower);
    console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
    console.log("Deploying...");


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



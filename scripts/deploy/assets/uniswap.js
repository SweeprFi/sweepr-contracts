const { ethers } = require("hardhat");
const { addresses, network } = require("../../../utils/address");
const { sleep } = require("../../../utils/helper_functions");

async function main() {
	[deployer] = await ethers.getSigners();
	const assetName = 'Uniswap Asset';
	const sweep = addresses.sweep;
	const usdc = addresses.usdc;
	const helper = addresses.liquidity_helper;
	const oracleUsdc = addresses.oracle_usdc_usd;
	const borrower = addresses.multisig;

	console.log("===========================================");
	console.log("UNISWAP ASSET DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("Asset Name:", assetName);
	console.log("SWEEP:", sweep);
	console.log("USDC:", usdc);
	console.log("Liquidity Helper:", helper);
	console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
	console.log("Borrower:", borrower);
	console.log("===========================================");
	console.log("Deploying in 5 seconds...");
	await sleep(5);
	console.log("Deploying...");


	const UniV3AssetFactory = await ethers.getContractFactory("UniV3Asset");
	const UniV3Asset = await UniV3AssetFactory.deploy(assetName, sweep, usdc, helper, oracleUsdc, borrower);

	console.log("===========================================");
	console.log("UniV3Asset deployed to: ", UniV3Asset.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${UniV3Asset.address} "${assetName}" ${sweep} ${usdc} ${helper} ${oracleUsdc} ${borrower}`);
}

main();



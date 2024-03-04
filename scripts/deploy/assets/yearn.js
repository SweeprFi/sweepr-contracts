const { ethers } = require("hardhat");
const { tokens, chainlink, protocols, wallets, network } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
	[deployer] = await ethers.getSigners();

	const assetName = "Yearn V3 Asset";
	const sweep = tokens.sweep;
	const usdc = tokens.usdc;
	const usdc_e = tokens.usdc_e;
	const oracleUsdc = chainlink.usdc_usd;
	const vault = protocols.yearn.vault;
	const borrower = wallets.multisig;

	console.log("===========================================");
    console.log("YEARN V3 ASSET DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("Asset Name:", assetName);
    console.log("SWEEP:", sweep);
    console.log("USDC:", usdc);
	console.log("USDC.e:", usdc_e);
    console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
    console.log("Yearn Vault:", vault);
    console.log("Borrower:", borrower);
    console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
    console.log("Deploying...");


	const Asset = await ethers.getContractFactory("YearnV3Asset");
	const asset = await Asset.deploy(
		assetName,
		sweep, // SWEEP
		usdc, // USDC
		usdc_e, // USDC.e
		vault, // YEARN VAULT
		oracleUsdc, // ORACLE USDC/USD
		borrower
	);

	console.log("YearnV3 asset deployed to: ", asset.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${assetName}" ${sweep} ${usdc} ${usdc_e} ${vault} ${oracleUsdc} ${borrower}`);
}

main();



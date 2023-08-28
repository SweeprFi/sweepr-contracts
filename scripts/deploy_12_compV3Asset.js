const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
	let deployer;
	const assetName = 'Compound V3 Asset';
	const sweep = addresses.sweep;
	const usdc = addresses.usdc_e;
	const cusdc = addresses.comp_cusdc;
	const oracleUsdc = addresses.oracle_usdc_usd;
	const borrower = addresses.borrower;

	if (network.type === "0") { // local
		[deployer] = await ethers.getSigners();
		deployer = deployer.address;
	} else {
		deployer = addresses.owner;
	}

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	const CompV3Factory = await ethers.getContractFactory("CompV3Asset");
	const CompV3 = await CompV3Factory.deploy(
		assetName,
		sweep,
		usdc,
		cusdc,
		oracleUsdc,
		borrower
	);
	await CompV3.deployed();

	console.log("CompV3 deployed to: ", CompV3.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${CompV3.address} "${assetName}" ${sweep} ${usdc} ${cusdc} ${oracleUsdc} ${borrower}`);
}

main();


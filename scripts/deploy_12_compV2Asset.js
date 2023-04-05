const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
	let deployer;
	const assetName = 'Compound Asset';
	const sweep = addresses.sweep;
	const usdc = addresses.usdc;
	const comp = addresses.comp;
	const cusdc = addresses.comp_cusdc;
	const controller = addresses.comp_control;
	const amm = addresses.uniswap_amm;
	const borrower = addresses.borrower;

	if (network.type === "0") { // local
		[deployer] = await ethers.getSigners();
		deployer = deployer.address;
	} else {
		deployer = addresses.owner;
	}

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	const CompV2Factory = await ethers.getContractFactory("CompV2Asset");
	const CompV2 = await CompV2Factory.deploy(assetName, sweep, usdc, comp, cusdc, controller, amm, borrower);
	await CompV2.deployed();

	console.log("CompV2 deployed to: ", CompV2.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${CompV2.address} "${assetName}" ${sweep} ${usdc} ${comp} ${cusdc} ${controller} ${amm} ${borrower}`);
}

main();


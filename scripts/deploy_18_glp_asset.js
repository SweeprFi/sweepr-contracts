const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
	let deployer;
	const assetName = 'GLP Asset';
	const sweep = addresses.sweep;
	const usdc = addresses.usdc;
	const reward_router = addresses.glp_reward_router;
	const oracle_weth_usdc = addresses.oracle_weth_usdc;
	const amm = addresses.uniswap_amm;
	const borrower = addresses.borrower;

	if (network.type === "0") { // local
		[owner] = await ethers.getSigners();
		deployer = owner.address
	} else {
		deployer = addresses.owner;
	}

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	const GLPAssetFactory = await ethers.getContractFactory("GlpAsset");
	const glpAsset = await GLPAssetFactory.deploy(
		assetName,
		sweep,
		usdc,
		reward_router,
		oracle_weth_usdc,
		amm,
		borrower
	);
	await glpAsset.deployed();

	console.log("GlpAsset deployed to: ", glpAsset.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${glpAsset.address} "${assetName}" ${sweep} ${usdc} ${reward_router} ${oracle_weth_usdc} ${amm} ${borrower}`);
}

main();



const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
    let deployer = '';
	const assetName = 'GLP Asset';
	const sweep = addresses.sweep;
	const usdc = addresses.usdc;
	const rewardRouter = addresses.glp_reward_router;
	const oracleUsdc = addresses.oracle_usdc_usd;
	const oracleWeth = addresses.oracle_weth_usd;
	const borrower = addresses.borrower;

    if (network.type === "0") { // local
        [deployer] = await ethers.getSigners();
        deployer = deployer.address;
    } else {
        deployer = addresses.owner;
    }

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	const GLPAssetFactory = await ethers.getContractFactory("GlpAsset");
	const glpAsset = await GLPAssetFactory.deploy(
		assetName,
		sweep,
		usdc,
		rewardRouter,
		oracleUsdc,
		oracleWeth,
		borrower
	);
	await glpAsset.deployed();

	console.log("GlpAsset deployed to: ", glpAsset.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${glpAsset.address} "${assetName}" ${sweep} ${usdc} ${rewardRouter} ${oracleUsdc} ${oracleWeth} ${borrower}`);
}

main();



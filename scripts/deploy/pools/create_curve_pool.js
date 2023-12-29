const { ethers } = require('hardhat');
const { tokens, network, curve, deployments } = require("../../../utils/constants");
const { ask } = require('../../../utils/helper_functions');


async function main() {
	[deployer] = await ethers.getSigners();

	const factory = await ethers.getContractAt("ICurvePoolFactory", curve.factory);
	const sweep = tokens.sweep;
	const usdc = tokens.usdc;
	const poolFee = 1e6; // 0.01%
	const amplification = 100;
	const offPegFeeMultiplier = 10000000000;
	const maExpTime = 865;
	const implementationIndex = 0;
	const assetTypes = [0, 1];
	const coins = [usdc, sweep];
	const oracles = ['0x0000000000000000000000000000000000000000', deployments.rates_oracle];
	const methodIds = ["0x00000000", "0x2e3d20a1"];

	console.log("===========================================");
	console.log("CREATING CURVE POOL");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("SWEEP:", sweep);
	console.log("USDC:", usdc);
	console.log("CurveFactory:", curve.factory);
	console.log("Coins:", coins);
	console.log("Amplification:", amplification);
	console.log("Fee:", poolFee, "=>", poolFee/1e8, '%');
	console.log("offPegFeeMultiplier:", offPegFeeMultiplier);
	console.log("maExpTime:", maExpTime);
	console.log("implementationIndex:", implementationIndex);
	console.log("assetTypes:", assetTypes);
	console.log("methodIds:", methodIds);
	console.log("Oracles:", oracles);
	console.log("===========================================");

	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Creating...");

	const pool = await( await factory.deploy_plain_pool(
		"SWEEP-USDC StablePool",
		"SWEEP-USDC",
		coins,
		amplification,
		poolFee,
		offPegFeeMultiplier,
		maExpTime,
		implementationIndex,
		assetTypes,
		methodIds,
		oracles,
	)).wait();

	console.log("===========================================");
	const poolAddress = pool.logs[0].address;
	console.log("poolAddress:", poolAddress);
}

main();

const { ethers, upgrades } = require('hardhat');
const { network, layerZero, wallets } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
	[deployer] = await ethers.getSigners();
	const stepValue = 70000; // 0.00274% daily rate ~ 4% yearly rate

	console.log("===========================================");
	console.log("SWEEP DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("lzEndpointAddress:", layerZero.endpoint);
	console.log("Multisig:", wallets.multisig);
	console.log("StepValue:", stepValue);
	console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
  	if(answer !== 'y'){ process.exit(); }
	console.log("Deploying...");

	const sweepInstance = await ethers.getContractFactory("SweepCoin");
	const sweep = await upgrades.deployProxy(sweepInstance, [
		layerZero.endpoint,
		wallets.multisig,
		stepValue
	], { initializer: 'initialize' });

	console.log("===========================================");
	console.log("Sweep deployed to:", sweep.address);
	console.log(`\nnpx hardhat verify --network ${network.name} [implementation_address]`)
}

main();

const { ethers, upgrades } = require('hardhat');
const { addresses, network } = require("../../../utils/address");
const { sleep } = require("../../../utils/helper_functions");
const LZ_ENDPOINTS = require("../../../utils/layerzero/layerzeroEndpoints.json")

async function main() {
	[deployer] = await ethers.getSigners();
	const lzEndpointAddress = LZ_ENDPOINTS[hre.network.name];
	const stepValue = 70000; // 0.00274% daily rate ~ 4% yearly rate

	console.log("===========================================");
	console.log("SWEEP DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("lzEndpointAddress:", lzEndpointAddress);
	console.log("Multisig:", addresses.multisig);
	console.log("StepValue:", stepValue);
	console.log("===========================================");
	console.log("Deploying in 5 seconds...");
	await sleep(5);
	console.log("Deploying...");


	const sweepInstance = await ethers.getContractFactory("SweepCoin");
	const sweep = await upgrades.deployProxy(sweepInstance, [
		lzEndpointAddress,
		addresses.multisig,
		stepValue
	], { initializer: 'initialize' });

	console.log("===========================================");
	console.log("Sweep deployed to:", sweep.address);
	console.log(`\nnpx hardhat verify --network ${network.name} [implementation_address]`)
}

main();

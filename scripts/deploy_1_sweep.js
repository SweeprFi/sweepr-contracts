const { ethers, upgrades } = require('hardhat');
const { addresses, network } = require("../utils/address");
const LZ_ENDPOINTS = require("../utils/layerzero/layerzeroEndpoints.json")

async function main() {
	let deployer = '';
	let lzEndpointAddress, lzEndpoint, LZEndpointMock

	if (network.type === "0") { // local
		[deployer] = await ethers.getSigners();
		deployer = deployer.address;

		LZEndpointMock = await ethers.getContractFactory("LZEndpointMock")
        lzEndpoint = await LZEndpointMock.deploy(1)
        lzEndpointAddress = lzEndpoint.address
	} else {
		deployer = addresses.owner;
		lzEndpointAddress = LZ_ENDPOINTS[hre.network.name]
	}

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	const sweepInstance = await ethers.getContractFactory("SweepDollarCoin");
	const sweep = await upgrades.deployProxy(sweepInstance, [
		lzEndpointAddress,
		addresses.owner,
		2500 // 0.25%
	], { initializer: 'initialize' });

	console.log("Sweep deployed to:", sweep.address);
}

main();

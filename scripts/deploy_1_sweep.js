const { ethers, upgrades } = require('hardhat');
const { addresses, network } = require("../utils/address");

async function main() {
	let deployer = '';

	if (network.type === "0") { // local
		[deployer] = await ethers.getSigners();
		deployer = deployer.address;
	} else {
		deployer = addresses.owner;
	}

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	const sweepInstance = await ethers.getContractFactory("SweepDollarCoin");
	const sweep = await upgrades.deployProxy(sweepInstance, [], { initializer: 'initialize' });

	console.log("Sweep deployed to:", sweep.address);
}

main();

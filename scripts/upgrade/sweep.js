const { ethers, upgrades } = require('hardhat');
const { network, addresses } = require('../../utils/address');

async function main() {
	let deployer = '';

	if (network.type === "0") { // local
		[deployer] = await ethers.getSigners();
		deployer = deployer.address;
	} else {
		deployer = addresses.owner;
	}

	console.log(`Updating contracts on ${network.name} with the account: ${deployer}`);

	let proxyAddress = addresses.sweep;
	const sweepInstance = await ethers.getContractFactory("SweepCoin");
	// await upgrades.forceImport(proxyAddress, sweepInstance);
	await upgrades.upgradeProxy(proxyAddress, sweepInstance);
	
	console.log("Sweep Upgraded!");
}

main();

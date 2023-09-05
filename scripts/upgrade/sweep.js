const { ethers } = require('hardhat');
const { network } = require('../../utils/address');

async function main() {
	[deployer] = await ethers.getSigners();
	deployer = deployer.address;

	console.log(`Updating contracts on ${network.name} with the account: ${deployer}`);

	const Sweep = await ethers.getContractFactory("SweepCoin");
	const new_imp = await Sweep.deploy();
	
	console.log("new sweep implementation", new_imp.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${new_imp.address}`);
}

main();

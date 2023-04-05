const { ethers } = require("hardhat");
const { network } = require("../utils/address");
const argumentsArray = require('./timelock/arguments');

async function main() {
	let deployer = '';

	if (network.type === "0") { // local
		[deployer] = await ethers.getSigners();
		deployer = deployer.address;
	} else {
		deployer = argumentsArray[3];
	}

	const DELAY = argumentsArray[0];
	const proposersArray = argumentsArray[1];
	const executorsArray = argumentsArray[2];

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	const timelockInstance = await ethers.getContractFactory("TimelockController");
	const timelockContract = await timelockInstance.deploy(DELAY, proposersArray, executorsArray, deployer);

	console.log("Timelock deployed to:", timelockContract.address);
	console.log(`\nnpx hardhat verify --network ${network.name} --constructor-args scripts/timelock/arguments.js ${timelockContract.address}`);
}

main();
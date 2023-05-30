const { ethers } = require("hardhat");
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

	// const Approver = await ethers.getContractFactory("TransferApproverBlacklist");
	const Approver = await ethers.getContractFactory("TransferApproverWhitelist");
	const approver = await Approver.deploy();

	console.log("Transfer approver deployed to:", approver.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${approver.address}`);
}

main();
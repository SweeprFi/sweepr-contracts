const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
	let deployer = '';
	const sweep = addresses.sweep;

	if (network.type === "0") { // local
		[deployer] = await ethers.getSigners();
		deployer = deployer.address;
	} else {
		deployer = addresses.owner;
	}

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	// const approverInstance = await ethers.getContractFactory("TransferApproverBlacklist");
	const approverInstance = await ethers.getContractFactory("TransferApproverWhitelist");
	const approverContract = await approverInstance.deploy(sweep);

	console.log("Transfer approver deployed to:", approverContract.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${approverContract.address} "${sweep}"`);
}

main();
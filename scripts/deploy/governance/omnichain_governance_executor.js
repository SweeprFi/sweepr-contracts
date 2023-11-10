const { ethers } = require("hardhat");
const { network } = require("../../../utils/address");
const { sleep } = require("../../../utils/helper_functions");
const LZ_ENDPOINTS = require("../../../utils/layerzero/layerzeroEndpoints.json")

async function main() {
	[deployer] = await ethers.getSigners();
	const lzEndpointAddress = LZ_ENDPOINTS[hre.network.name];

	console.log("===========================================");
	console.log("OMNICHAIN GOVERNANCE EXECUTOR - DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("lzEndpointAddress:", lzEndpointAddress);
	console.log("===========================================");
	console.log("Deploying in 5 seconds...");
	await sleep(5);
	console.log("Deploying...");


	const OmnichainProposalExecutor = await ethers.getContractFactory("OmnichainGovernanceExecutor");
	const proposalExecutor = await OmnichainProposalExecutor.deploy(lzEndpointAddress);
	await proposalExecutor.deployed();

	console.log("===========================================");
	console.log("OmnichainGovernanceExecutor deployed to: ", proposalExecutor.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${proposalExecutor.address} ${lzEndpointAddress}`);
}

main();



const { ethers } = require("hardhat");
const { network, layerZero } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
	[deployer] = await ethers.getSigners();

	console.log("===========================================");
	console.log("OMNICHAIN GOVERNANCE EXECUTOR - DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("lzEndpointAddress:", layerZero.endpoint);
	console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
  	if(answer !== 'y'){ process.exit(); }
	console.log("Deploying...");


	const OmnichainProposalExecutor = await ethers.getContractFactory("OmnichainGovernanceExecutor");
	const proposalExecutor = await OmnichainProposalExecutor.deploy(layerZero.endpoint);
	await proposalExecutor.deployed();

	console.log("===========================================");
	console.log("OmnichainGovernanceExecutor deployed to: ", proposalExecutor.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${proposalExecutor.address} ${layerZero.endpoint}`);
}

main();



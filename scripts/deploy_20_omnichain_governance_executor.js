const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");
const LZ_ENDPOINTS = require("../utils/layerzero/layerzeroEndpoints.json")

async function main() {
	let deployer;

	if (network.type === "0") { // local
		[owner] = await ethers.getSigners();
		deployer = owner.address

		LZEndpointMock = await ethers.getContractFactory("OmnichainGovernanceExecutor")
        lzEndpoint = await LZEndpointMock.deploy(1)
        lzEndpointAddress = lzEndpoint.address
	} else {
		deployer = addresses.owner;
		lzEndpointAddress = LZ_ENDPOINTS[hre.network.name]
	}

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	const OmnichainProposalExecutor = await ethers.getContractFactory("OmnichainGovernanceExecutor");
	const proposalExecutor = await OmnichainProposalExecutor.deploy(lzEndpointAddress);
	await proposalExecutor.deployed();

	console.log("OmnichainGovernanceExecutor deployed to: ", proposalExecutor.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${proposalExecutor.address} ${lzEndpointAddress}`);
}

main();



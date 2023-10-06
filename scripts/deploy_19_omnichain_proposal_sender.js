const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");
const LZ_ENDPOINTS = require("../utils/layerzero/layerzeroEndpoints.json")

async function main() {
	[owner] = await ethers.getSigners();
	deployer = owner.address

	if (network.type === "0") { // local
		LZEndpointMock = await ethers.getContractFactory("LZEndpointMock")
        lzEndpoint = await LZEndpointMock.deploy(1)
        lzEndpointAddress = lzEndpoint.address
	} else {
		lzEndpointAddress = LZ_ENDPOINTS[hre.network.name]
	}

	console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

	const OmnichainProposalSender = await ethers.getContractFactory("OmnichainProposalSender");
	const proposalSender = await OmnichainProposalSender.deploy(lzEndpointAddress);
	await proposalSender.deployed();

	console.log("OmnichainProposalSender deployed to: ", proposalSender.address);
	console.log(`\nnpx hardhat verify --network ${network.name} ${proposalSender.address} ${lzEndpointAddress}`);
}

main();



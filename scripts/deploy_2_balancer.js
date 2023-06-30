const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");
const LZ_ENDPOINTS = require("../utils/layerzero/layerzeroEndpoints.json")

async function main() {
  [deployer] = await ethers.getSigners();
  deployer = deployer.address;

  const sweep = addresses.sweep;

  if (network.type === "0") { // local
		LZEndpointMock = await ethers.getContractFactory("LZEndpointMock")
    lzEndpoint = await LZEndpointMock.deploy(1)
    lzEndpointAddress = lzEndpoint.address
	} else {
		lzEndpointAddress = LZ_ENDPOINTS[hre.network.name]
	}

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const Balancer = await ethers.getContractFactory("Balancer");
  const balancer = await Balancer.deploy(sweep, lzEndpointAddress);

  console.log("Balancer deployed to:", balancer.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${balancer.address} ${sweep} ${lzEndpointAddress}`)

  const SweepCoin = await ethers.getContractAt("SweepCoin", sweep);
  await SweepCoin.setBalancer(balancer.address);
}

main();

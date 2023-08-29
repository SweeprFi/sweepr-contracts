const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");
const { Const } = require("../utils/helper_functions");
const LZ_ENDPOINTS = require("../utils/layerzero/layerzeroEndpoints.json")

async function main() {
  [deployer] = await ethers.getSigners();
  deployer = deployer.address;

  let isGovernanceChain = Const.FALSE;
  let lzEndpointAddress, lzEndpoint, LZEndpointMock

  if (network.type === "0") { // local
    LZEndpointMock = await ethers.getContractFactory("LZEndpointMock")
    lzEndpoint = await LZEndpointMock.deploy(1)
    lzEndpointAddress = lzEndpoint.address
  } else {
    lzEndpointAddress = LZ_ENDPOINTS[hre.network.name]
  }

  if (hre.network.name === process.env.GOVERNANCE_CHAIN) isGovernanceChain = Const.TRUE;

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const sweeprInstance = await ethers.getContractFactory("SweeprCoin");
  const sweeprContract = await sweeprInstance.deploy(isGovernanceChain, lzEndpointAddress);

  console.log("SweeprCoin deployed to:", sweeprContract.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${sweeprContract.address} ${isGovernanceChain} ${lzEndpointAddress}`);
}

main();

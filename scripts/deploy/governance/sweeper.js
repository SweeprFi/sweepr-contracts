const { ethers } = require("hardhat");
const { network } = require("../../../utils/address");
const { sleep } = require("../../../utils/helper_functions");
const LZ_ENDPOINTS = require("../../../utils/layerzero/layerzeroEndpoints.json")

async function main() {
  [deployer] = await ethers.getSigners();
  const isGovernanceChain = hre.network.name === process.env.GOVERNANCE_CHAIN;
  const lzEndpointAddress = LZ_ENDPOINTS[hre.network.name];

  console.log("===========================================");
  console.log("SWEEPR DEPLOY");
  console.log("===========================================");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("===========================================");
  console.log("isGovernanceChain:", isGovernanceChain);
  console.log("lzEndpointAddress:", lzEndpointAddress);
  console.log("===========================================");
  console.log("Deploying in 5 seconds...");
  await sleep(5);
  console.log("Deploying...");

  const sweeprInstance = await ethers.getContractFactory("SweeprCoin");
  const sweeprContract = await sweeprInstance.deploy(isGovernanceChain, lzEndpointAddress);

  console.log("===========================================");
  console.log("SweeprCoin deployed to:", sweeprContract.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${sweeprContract.address} ${isGovernanceChain} ${lzEndpointAddress}`);
}

main();

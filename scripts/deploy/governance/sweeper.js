const { ethers } = require("hardhat");
const { network, layerZero } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
  [deployer] = await ethers.getSigners();
  const isGovernanceChain = hre.network.name === process.env.GOVERNANCE_CHAIN;

  console.log("===========================================");
  console.log("SWEEPR DEPLOY");
  console.log("===========================================");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("===========================================");
  console.log("isGovernanceChain:", isGovernanceChain);
  console.log("lzEndpointAddress:", layerZero.endpoint);
  console.log("===========================================");
  const answer = (await ask("continue? y/n: "));
  if(answer !== 'y'){ process.exit(); }
  console.log("Deploying...");

  const sweeprInstance = await ethers.getContractFactory("SweeprCoin");
  const sweeprContract = await sweeprInstance.deploy(isGovernanceChain, layerZero.endpoint);

  console.log("===========================================");
  console.log("SweeprCoin deployed to:", sweeprContract.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${sweeprContract.address} ${isGovernanceChain} ${layerZero.endpoint}`);
}

main();

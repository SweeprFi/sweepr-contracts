const { ethers } = require("hardhat");
const { tokens, network, layerZero } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
  [deployer] = await ethers.getSigners();
  const sweep = tokens.sweep;

  console.log("===========================================");
  console.log("BALANCER DEPLOY");
  console.log("===========================================");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("===========================================");
  console.log("lzEndpointAddress:", layerZero.endpoint);
  console.log("SweepAddress:", sweep);
  console.log("===========================================");
  const answer = (await ask("continue? y/n: "));
  if(answer !== 'y'){ process.exit(); }
	console.log("Deploying...");


  const Balancer = await ethers.getContractFactory("Balancer");
  const balancer = await Balancer.deploy(sweep, layerZero.endpoint);

  console.log("===========================================");
  console.log("Balancer deployed to:", balancer.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${balancer.address} ${sweep} ${layerZero.endpoint}`)
}

main();

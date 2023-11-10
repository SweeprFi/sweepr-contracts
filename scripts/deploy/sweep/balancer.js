const { ethers } = require("hardhat");
const { addresses, network } = require("../../../utils/address");
const { sleep } = require("../../../utils/helper_functions");
const LZ_ENDPOINTS = require("../../../utils/layerzero/layerzeroEndpoints.json")

async function main() {
  [deployer] = await ethers.getSigners();
  const lzEndpointAddress = LZ_ENDPOINTS[hre.network.name];
  const sweep = addresses.sweep;

  console.log("===========================================");
  console.log("BALANCER DEPLOY");
  console.log("===========================================");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("===========================================");
  console.log("lzEndpointAddress:", lzEndpointAddress);
  console.log("SweepAddress:", sweep);
  console.log("===========================================");
  console.log("Deploying in 5 seconds...");
  await sleep(5);
  console.log("Deploying...");


  const Balancer = await ethers.getContractFactory("Balancer");
  const balancer = await Balancer.deploy(sweep, lzEndpointAddress);

  console.log("===========================================");
  console.log("Balancer deployed to:", balancer.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${balancer.address} ${sweep} ${lzEndpointAddress}`)
}

main();

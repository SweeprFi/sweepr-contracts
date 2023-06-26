const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  [deployer] = await ethers.getSigners();
  deployer = deployer.address;

  const sweep = addresses.sweep;

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const Balancer = await ethers.getContractFactory("Balancer");
  const balancer = await Balancer.deploy(sweep);

  console.log("Balancer deployed to:", balancer.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${balancer.address} ${sweep}`)

  const SweepCoin = await ethers.getContractAt("SweepCoin", sweep);
  await SweepCoin.setBalancer(balancer.address);
}

main();

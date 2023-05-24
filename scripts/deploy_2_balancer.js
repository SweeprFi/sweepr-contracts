const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const sweep = addresses.sweep;

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const Balancer = await ethers.getContractFactory("Balancer");
  const balancer = await Balancer.deploy(sweep);

  console.log("Balancer deployed to:", balancer.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${balancer.address} ${sweep}`)

  const SweepCoin = await ethers.getContractAt("SweepDollarCoin", sweep);
  await SweepCoin.setBalancer(balancer.address);
}

main();

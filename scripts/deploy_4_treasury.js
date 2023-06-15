const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  [deployer] = await ethers.getSigners();
  deployer = deployer.address;

  const sweep = addresses.sweep;

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(sweep);

  console.log(`Treasury Deployed to:${treasury.address}`);
  console.log(`\nnpx hardhat verify --network ${network.name} ${treasury.address} ${sweep}`);
}

main();

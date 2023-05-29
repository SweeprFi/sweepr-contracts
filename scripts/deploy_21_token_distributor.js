const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const sweepAddress = addresses.sweep;
  const sweeperAddress = addresses.sweeper;

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const distributorInstance = await ethers.getContractFactory("TokenDistributor");
  const distributorContract = await distributorInstance.deploy(sweepAddress, sweeperAddress);

  console.log("TokenDistributor deployed to:", distributorContract.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${distributorContract.address} ${sweepAddress} ${sweeperAddress}`);
}

main();
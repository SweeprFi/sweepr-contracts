const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const sweeprAddress = addresses.sweepr;
  const treasuryAddress = addresses.treasury;

  [deployer] = await ethers.getSigners();
  deployer = deployer.address;

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const distributorInstance = await ethers.getContractFactory("TokenDistributor");
  const distributorContract = await distributorInstance.deploy(sweeprAddress, treasuryAddress);

  console.log("TokenDistributor deployed to:", distributorContract.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${distributorContract.address} ${sweeprAddress} ${treasuryAddress}`);
}

main();

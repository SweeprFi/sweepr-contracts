const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const sweepAddress = addresses.sweep;

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const sweeprInstance = await ethers.getContractFactory("SweeprCoin");
  const sweeprContract = await sweeprInstance.deploy(sweepAddress);

  console.log("SweeprCoin deployed to:", sweeprContract.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${sweeprContract.address} ${sweepAddress}`);
}

main();

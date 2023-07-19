const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const sweeprAddress = addresses.sweepr;

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const vestingApproverInstance = await ethers.getContractFactory("VestingApprover");
  const vestingApproverContract = await vestingApproverInstance.deploy(sweeprAddress);

  console.log("VestingApprover deployed to:", vestingApproverContract.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${vestingApproverContract.address} ${sweeprAddress}`);
}

main();

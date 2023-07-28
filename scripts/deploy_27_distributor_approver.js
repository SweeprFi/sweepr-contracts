const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const sweeprAddress = addresses.sweepr;
  const tokenDistributorAddress = addresses.token_distributor;

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const distributorApproverInstance = await ethers.getContractFactory("TokenDistributorApprover");
  const distributorApproverContract = await distributorApproverInstance.deploy(sweeprAddress, tokenDistributorAddress);

  console.log("TokenDistributor deployed to:", distributorApproverContract.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${distributorApproverContract.address} ${sweeprAddress} ${tokenDistributorAddress}`);
}

main();

const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const sweepAddress = addresses.sweep;
  const approverAddress = addresses.approver;
  const treasuryAddress = addresses.treasury;

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const sweeperInstance = await ethers.getContractFactory("SWEEPER");
  const sweeperContract = await sweeperInstance.deploy(sweepAddress, approverAddress, treasuryAddress);

  console.log("SWEEPER deployed to:", sweeperContract.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${sweeperContract.address} ${sweepAddress} ${approverAddress} ${treasuryAddress}`);
}

main();

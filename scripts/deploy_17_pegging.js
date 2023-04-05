const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const sweep = addresses.sweep;
  const usdc = addresses.usdc;

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const Pegging = await ethers.getContractFactory("Pegging");
  const pegging = await Pegging.deploy(sweep, usdc);

  console.log("Pegging deployed to:", pegging.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${pegging.address} ${sweep} ${usdc}`)
}

main();

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

  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(sweep);

  console.log(`Treasury Deployed to:${treasury.address}`);
  console.log(`\nnpx hardhat verify --network ${network.name} ${treasury.address} ${sweep}`);
}

main();

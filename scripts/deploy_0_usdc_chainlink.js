const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const oracle = addresses.oracle_usdc_usd;

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const USDCOracle = await ethers.getContractFactory("ChainlinkUSDPricer");
  const usdcOracle = await USDCOracle.deploy(
    oracle
  );

  console.log(`USDC Oracle deployed to:${usdcOracle.address}`);
  console.log(`\nnpx hardhat verify --network ${network.name} ${usdcOracle.address} ${oracle}`);
}

main();

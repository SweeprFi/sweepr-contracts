const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const poolAddress = addresses.uniswap_pool;
  const sweepAddress = addresses.sweep;

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const uniV3TWAPOracleInstance = await ethers.getContractFactory("UniV3TWAPOracle");
  const uniV3TWAPOracleContract = await uniV3TWAPOracleInstance.deploy(sweepAddress, poolAddress);

  console.log(`UniV3TWAPOracle deployed to:${uniV3TWAPOracleContract.address}`);
  console.log(`\nnpx hardhat verify --network ${network.name} ${uniV3TWAPOracleContract.address} ${sweepAddress} ${poolAddress}`);
}

main();

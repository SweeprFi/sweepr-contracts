const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const poolAddress = addresses.uniswap_pool;
  const sweepAddress = addresses.sweep;
  const oracle = addresses.oracle_usdc_usd;

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const UniswapOracle = await ethers.getContractFactory("UniswapOracle");
  const uniswapOracle = await UniswapOracle.deploy(
    sweepAddress,
    poolAddress,
    oracle
  );

  console.log(`Uniswap Oracle deployed to:${uniswapOracle.address}`);
  console.log(`\nnpx hardhat verify --network ${network.name} ${uniswapOracle.address} ${sweepAddress} ${poolAddress} ${oracle}`);
}

main();

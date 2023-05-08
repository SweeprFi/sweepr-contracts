const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const sweepAddress = addresses.sweep;
  const oracle = addresses.oracle_usdc_usd;
  const sequencer = addresses.sequencer_feed;
  const fee = 500;

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const uniswapAMMInstance = await ethers.getContractFactory("UniswapAMM");
  const uniswapAMMContract = await uniswapAMMInstance.deploy(sweepAddress, fee, oracle, sequencer);

  console.log(`UniswapAMM Deployed to:${uniswapAMMContract.address}`);
  console.log(`\nnpx hardhat verify --network ${network.name} ${uniswapAMMContract.address} ${sweepAddress} ${fee} ${oracle} ${sequencer}`);
}

main();

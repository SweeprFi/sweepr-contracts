const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const assetName = 'WBTC Asset';
  const sweep = addresses.sweep;
  const usdc = addresses.usdc;
  const wbtc = addresses.wbtc;
  const oracle = addresses.oracle_wbtc_usd;
  const borrower = addresses.borrower;

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const WBTCAsset = await ethers.getContractFactory("TokenAsset");
  const wbtcAsset = await WBTCAsset.deploy(assetName, sweep, usdc, wbtc, oracle, borrower);

  console.log("WBTC Asset deployed to:", wbtcAsset.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${wbtcAsset.address} "${assetName}" ${sweep} ${usdc} ${wbtc} ${oracle} ${borrower}`)
}

main();


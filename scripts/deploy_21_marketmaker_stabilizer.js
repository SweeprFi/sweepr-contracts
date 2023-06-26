const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");

async function main() {
  [deployer] = await ethers.getSigners();
  deployer = deployer.address;

  const assetName = 'Market Maker';
  const sweep = addresses.sweep;
  const usdc = addresses.usdc;
  const liquidityHelper = addresses.liquidity_helper;
  const topSpread = 500; // 0.05%
  const bottomSpread = 0; // 0
  const tickSpread = 1000; // 0.1%
  const borrower = addresses.borrower;

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const MarketMaker = await ethers.getContractFactory("MarketMaker");
  const stabilizer = await MarketMaker.deploy(assetName, sweep, usdc, liquidityHelper, borrower, topSpread, bottomSpread, tickSpread);

  console.log("MarketMaker deployed to: ", stabilizer.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${stabilizer.address} "${assetName}" ${sweep} ${usdc} ${liquidityHelper} ${borrower} ${topSpread} ${bottomSpread} ${tickSpread}`);
}

main();


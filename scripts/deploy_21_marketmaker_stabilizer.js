const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");

async function main() {
  let deployer = borrower = '';
  const assetName = 'Market Maker';
  const sweep = addresses.sweep;
  const usdc = addresses.usdc;
  const amm = addresses.uniswap_amm;
  const uniswapOracle = addresses.uniswap_oracle;
  const topSpread = 1000; // 0.1%
  const bottomSpread = 0; // 0

  if (network.type === "0") { // local
    [owner, borrower, wallet] = await ethers.getSigners();
    deployer = owner.address;
    borrower = borrower.address;
  } else {
    deployer = addresses.owner;
    borrower = addresses.borrower;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const MarketMaker = await ethers.getContractFactory("MarketMaker");
  const stabilizer = await MarketMaker.deploy(assetName, sweep, usdc, amm, borrower, uniswapOracle, topSpread, bottomSpread);

  console.log("MarketMaker deployed to: ", stabilizer.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${stabilizer.address} "${assetName}" ${sweep} ${usdc} ${amm} ${borrower} ${uniswapOracle} ${topSpread} ${bottomSpread}`);
}

main();


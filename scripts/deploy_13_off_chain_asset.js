const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");

async function main() {
  let deployer = borrower = wallet = '';
  const assetName = 'MM wallet test';
  const sweep = addresses.sweep;
  const usdc = addresses.usdc;
  const amm = addresses.uniswap_amm;
  const oracle_usdc = addresses.oracle_usdc;

  if (network.type === "0") { // local
    [owner, borrower, wallet] = await ethers.getSigners();
    deployer = owner.address;
    borrower = borrower.address;
    wallet = wallet.address;
  } else {
    deployer = addresses.owner;
    borrower = addresses.borrower;
    wallet = addresses.wallet;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const OffChainAsset = await ethers.getContractFactory("OffChainAsset");
  const asset = await OffChainAsset.deploy(assetName, sweep, usdc, wallet, amm, borrower, oracle_usdc);

  console.log("OffChainAsset deployed to: ", asset.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${assetName}" ${sweep} ${usdc} ${wallet} ${amm} ${borrower} ${oracle_usdc}`);
}

main();


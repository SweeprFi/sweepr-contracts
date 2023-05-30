const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const assetName = 'bIB01 Asset';
  const sweep = addresses.sweep;
  const usdc = addresses.usdc;
  const backed = addresses.backed;
  const oracle_backed_usd = addresses.oracle_backed_usd;
  const backed_mint = addresses.backed_mint;
  const backed_redeem = addresses.backed_redeem;
  const borrower = addresses.borrower;
  
  [deployer] = await ethers.getSigners();
  deployer = deployer.address;

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const BackedAsset = await ethers.getContractFactory("BackedAsset");
  const backedAsset = await BackedAsset.deploy(
    assetName, 
    sweep, 
    usdc, 
    backed, 
    backed_mint,
    backed_redeem,
    oracle_backed_usd, 
    borrower
  );

  console.log("Backed Asset deployed to:", backedAsset.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${backedAsset.address} "${assetName}" ${sweep} ${usdc} ${backed} ${backed_mint} ${backed_redeem} ${oracle_backed_usd} ${borrower}`)
}

main();


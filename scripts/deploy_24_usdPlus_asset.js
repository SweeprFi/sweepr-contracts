const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const name = 'USDPlus Asset';
  const sweep = addresses.sweep;
  const usdc = addresses.usdc;
  const usdPlus = addresses.usdPlus;
  const exchanger = addresses.usdPlus_exchanger;
  const borrower = addresses.borrower;
  
  [deployer] = await ethers.getSigners();
  deployer = deployer.address;

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const Asset = await ethers.getContractFactory("USDPlusAsset");
  const asset = await Asset.deploy(
    name, 
    sweep, 
    usdc, 
    usdPlus, 
    exchanger,
    borrower
  );

  console.log("Backed Asset deployed to:", asset.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${usdPlus} ${exchanger} ${borrower}`)
}

main();


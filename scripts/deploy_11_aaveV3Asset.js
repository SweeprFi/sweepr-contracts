const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
	assetName = 'Aave V3 Asset';
  sweepAddress = addresses.sweep;
  usdcAddress = addresses.usdc;
  aaveUsdc = addresses.aave_usdc;
  aaveV3_pool = addresses.aaveV3_pool;
  borrower = addresses.borrower;

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const AaveAssetFactory = await ethers.getContractFactory("AaveV3Asset");
  const AaveV3Asset = await AaveAssetFactory.deploy(
    assetName,
    sweepAddress,
    usdcAddress,
    aaveUsdc,
    aaveV3_pool,
    borrower
  );

  console.log("AaveV3Asset deployed to: ", AaveV3Asset.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${AaveV3Asset.address} "${assetName}" ${sweepAddress} ${usdcAddress} ${aaveUsdc} ${aaveV3_pool} ${borrower}`);
}

main();

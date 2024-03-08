const { ethers } = require("hardhat");
const { network, tokens, protocols, chainlink, wallets } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
  [deployer] = await ethers.getSigners();
  const assetName = 'Aura Asset';
  const sweep = tokens.sweep;
  const usdc = tokens.usdc;
  const depositor = protocols.aura.rewardPoolDepositWapper;
  const shares = protocols.aura.baseRewardPool4626;
  const pool = protocols.aura.balancerPool;
  const quoterLib = protocols.aura.weighted_pool_library;
  const oracle = chainlink.usdc_usd;
  const borrower = wallets.multisig;

  console.log("===========================================");
  console.log("AURA ASSET DEPLOY");
  console.log("===========================================");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("===========================================");
  console.log("Asset name:", assetName);
  console.log("SWEEP:", sweep);
  console.log("USDC:", usdc);
  console.log("Depositor:", depositor);
  console.log("Shares:", shares);
  console.log("POOL:", pool);
  console.log("Weighted Lib:", quoterLib);
  console.log("Oracle USDC/USD:", oracle);
  console.log("Borrower:", borrower);
  console.log("===========================================");

  const answer = (await ask("continue? y/n: "));
  if (answer !== 'y') { process.exit(); }
  console.log("Creating...");

  const Asset = await ethers.getContractFactory("AuraAsset");
  const asset = await Asset.deploy(
    assetName,
    sweep,
    usdc,
    depositor,
    shares,
    pool,
    quoterLib,
    oracle,
    borrower,
  );

  console.log("===========================================");
  console.log("Aura Asset deployed to:", asset.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${asser.address} "${assetName}" ${sweep} ${usdc} ${depositor} ${shares} ${pool} ${quoterLib} ${oracle} ${borrower}`);
}

main();

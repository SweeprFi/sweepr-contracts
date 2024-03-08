const { ethers } = require("hardhat");
const { tokens, chainlink, protocols, wallets, network, uniswap } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
  [deployer] = await ethers.getSigners();

  const assetName = "Yearn V2 Asset";
  const sweep = tokens.sweep;
  const usdc = tokens.usdc;
  const dai = tokens.dai;
  const oracleUsdc = chainlink.usdc_usd;
  const vault = protocols.yearn.vault;
  const stake = protocols.yearn.stake;
  const borrower = wallets.multisig;
  const router = uniswap.router;

  console.log("===========================================");
  console.log("YEARN V2 ASSET DEPLOY");
  console.log("===========================================");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("===========================================");
  console.log("Asset Name:", assetName);
  console.log("SWEEP:", sweep);
  console.log("USDC:", usdc);
  console.log("DAI:", dai);
  console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
  console.log("Yearn Vault:", vault);
  console.log("Yearn Stake:", stake);
  console.log("Borrower:", borrower);
  console.log("Router:", router);
  console.log("===========================================");
  const answer = (await ask("continue? y/n: "));
  if (answer !== 'y') { process.exit(); }
  console.log("Deploying...");

  const Asset = await ethers.getContractFactory("YearnV2Asset");
  const asset = await Asset.deploy(
    assetName,
    sweep,
    usdc,
    dai,
    vault,
    stake,
    oracleUsdc,
    borrower,
    router,
  );

  console.log("Yearn V2 asset deployed to: ", asset.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${assetName}" ${sweep} ${usdc} ${dai} ${vault} ${stake} ${oracleUsdc} ${borrower} ${router}`);
}

main();



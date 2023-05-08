const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const assetName = 'WETH Asset';
  const sweep = addresses.sweep;
  const usdc = addresses.usdc;
  const weth = addresses.weth;
  const oracle_weth_usd = addresses.oracle_weth_usd;
  const oracle_usdc = addresses.usdc_oracle;
  const uniswap_amm = addresses.uniswap_amm;
  const borrower = addresses.borrower;


  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;
  } else {
    deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const WETHAsset = await ethers.getContractFactory("TokenAsset");
  const wethAsset = await WETHAsset.deploy(assetName, sweep, usdc, weth, oracle_weth_usd, uniswap_amm, borrower, oracle_usdc);

  console.log("WETH Asset deployed to:", wethAsset.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${wethAsset.address} "${assetName}" ${sweep} ${usdc} ${weth} ${oracle_weth_usd} ${uniswap_amm} ${borrower} ${oracle_usdc}`)
}

main();


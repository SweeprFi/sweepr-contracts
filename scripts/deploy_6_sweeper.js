const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");
const LZ_ENDPOINTS = require("../utils/layerzero/layerzeroEndpoints.json")

async function main() {
  let deployer = '';
  const sweepAddress = addresses.sweep;
  let lzEndpointAddress, lzEndpoint, LZEndpointMock

  if (network.type === "0") { // local
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;

    LZEndpointMock = await ethers.getContractFactory("LZEndpointMock")
    lzEndpoint = await LZEndpointMock.deploy(1)
    lzEndpointAddress = lzEndpoint.address
  } else {
    deployer = addresses.owner;
    lzEndpointAddress = LZ_ENDPOINTS[hre.network.name]
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const sweeprInstance = await ethers.getContractFactory("SweeprCoin");
  const sweeprContract = await sweeprInstance.deploy(sweepAddress, lzEndpointAddress);

  console.log("SweeprCoin deployed to:", sweeprContract.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${sweeprContract.address} ${sweepAddress} ${lzEndpointAddress}`);
}

main();

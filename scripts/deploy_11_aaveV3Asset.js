const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
    let deployer = '';
    const assetName = 'Aave V3 Asset';
    const sweep = addresses.sweep;
    const usdc = addresses.usdc;
    const aaveUsdc = addresses.aave_usdc;
    const aaveV3Pool = addresses.aaveV3_pool;
    const oracleUsdc = addresses.oracle_usdc_usd;
    const borrower = addresses.borrower;

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
        sweep,
        usdc,
        aaveUsdc,
        aaveV3Pool,
        oracleUsdc,
        borrower
    );

    console.log("AaveV3Asset deployed to: ", AaveV3Asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${AaveV3Asset.address} "${assetName}" ${sweep} ${usdc} ${aaveUsdc} ${aaveV3Pool} ${oracleUsdc} ${borrower}`);
}

main();

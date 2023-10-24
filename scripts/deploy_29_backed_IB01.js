const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");
const { Const} = require("../utils/helper_functions");


async function main() {
    let deployer = '';
    const assetName = 'Backed IB01 Asset';
    const sweep = addresses.sweep;
    const usdc = addresses.usdc;
    const backedIB01 = addresses.backedIB01;
    const oracleUsdc = addresses.oracle_usdc_usd;
    const oracleBackedIB01 = addresses.oracle_backedIB01_usd;
    const borrower = addresses.borrower;

    if (network.type === "0") { // local
        [deployer] = await ethers.getSigners();
        deployer = deployer.address;
    } else {
        deployer = addresses.owner;
    }

    console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

    const BackedAsset = await ethers.getContractFactory("BaseTokenAsset");
    const backedAsset = await BackedAsset.deploy(
        assetName, 
        sweep, 
        usdc, 
        backedIB01, 
        oracleUsdc,
        oracleBackedIB01, 
        borrower
    );

    console.log("Backed IB01 Asset deployed to:", backedAsset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${backedAsset.address} "${assetName}" ${sweep} ${usdc} ${weth} ${oracleUsdc} ${oracleWeth} ${borrower}`)
}

main();


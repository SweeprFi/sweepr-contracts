const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
    let deployer = '';
    const assetName = 'bIB01 Asset';
    const sweep = addresses.sweep;
    const usdc = addresses.usdc;
    const backed = addresses.backed;
    const backedMint = addresses.backed_mint;
    const backedRedeem = addresses.backed_redeem;
    const oracleUsdc = addresses.oracle_usdc_usd;
    const oracleBacked = addresses.oracle_backed_usd;
    const borrower = addresses.borrower;

    if (network.type === "0") { // local
        [deployer] = await ethers.getSigners();
        deployer = deployer.address;
    } else {
        deployer = addresses.owner;
    }

    console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

    const BackedAsset = await ethers.getContractFactory("BackedAsset");
    const backedAsset = await BackedAsset.deploy(
        assetName,
        sweep,
        usdc,
        backed,
        backedMint,
        backedRedeem,
        oracleUsdc,
        oracleBacked,
        borrower
    );

    console.log("Backed Asset deployed to:", backedAsset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${backedAsset.address} "${assetName}" ${sweep} ${usdc} ${backed} ${backedMint} ${backedRedeem} ${oracleUsdc} ${oracleBacked} ${borrower}`)
}

main();


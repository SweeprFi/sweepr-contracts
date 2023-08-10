const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
    let deployer = '';
    const name = 'DSR Asset';
    const sweep = addresses.sweep;
    const usdc = addresses.usdc;
    const dai = addresses.dai;
    const dsrManager = addresses.dsr_manager;
    const oracleUsdc = addresses.oracle_usdc_usd;
    const oracleDai = addresses.oracle_dai_usd;
    const borrower = addresses.borrower;

    [deployer] = await ethers.getSigners();
    deployer = deployer.address;

    console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

    const Asset = await ethers.getContractFactory("DsrAsset");
    const asset = await Asset.deploy(
        name,
        sweep,
        usdc,
        dai,
        dsrManager,
        oracleUsdc,
        oracleDai,
        borrower
    );

    console.log("Backed Asset deployed to:", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${dai} ${dsrManager} ${oracleUsdc} ${oracleDai} ${borrower}`)
}

main();


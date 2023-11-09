const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;

    const name = 'Balancer Asset';
    const sweep = addresses.sweep;
    const usdc = addresses.usdc;
    const oracleUsdc = addresses.oracle_usdc_usd;
    const pool = addresses.balancer_pool;
    const borrower = addresses.multisig;

    console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

    const Asset = await ethers.getContractFactory("BalancerAsset");
    const asset = await Asset.deploy(
            name,
            sweep,
            usdc,
            oracleUsdc,
            pool,
            borrower
        );

    console.log("Balancer Asset deployed to:", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${oracleUsdc} ${pool} ${borrower}`)
}

main();

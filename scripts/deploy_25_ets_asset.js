const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");

async function main() {
    let deployer = '';
    const name = 'ETS Asset';
    const sweep = addresses.sweep;
    const usdc = addresses.usdc;
    const ets = addresses.ets;
    const exchanger = addresses.ets_exchanger;
    const oracleUsdc = addresses.oracle_usdc_usd;
    const borrower = addresses.borrower;

    if (network.type === "0") { // local
        [deployer] = await ethers.getSigners();
        deployer = deployer.address;
    } else {
        deployer = addresses.owner;
    }

    console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

    const Asset = await ethers.getContractFactory("ETSAsset");
    const asset = await Asset.deploy(
        name,
        sweep,
        usdc,
        ets,
        exchanger,
        oracleUsdc,
        borrower
    );

    console.log("Backed Asset deployed to:", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${ets} ${exchanger} ${oracleUsdc} ${borrower}`)
}

main();


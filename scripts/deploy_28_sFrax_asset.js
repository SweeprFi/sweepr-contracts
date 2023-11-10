const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");
const { Const } = require("../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;

    const name = 'sFrax Asset';
    const sweep = addresses.sweep;
    const usdc = addresses.usdc;
    const frax = addresses.frax;
    const sfrax = addresses.sfrax;
    const oracleUsdc = addresses.oracle_usdc_usd;
    const oracleFrax = addresses.oracle_frax_usd;
    const fee = Const.FEE;
    const borrower = addresses.multisig;

    console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

    const Asset = await ethers.getContractFactory("SFraxAsset");
    const asset = await Asset.deploy(
        name,
        sweep, // SWEEP
        usdc, // USDC
        frax,
        sfrax,
        oracleUsdc,
        oracleFrax,
        fee,
        borrower
    );

    console.log("sFrax Asset deployed to:", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${frax} ${sfrax} ${oracleUsdc} ${oracleFrax} ${fee} ${borrower}`)
}

main();
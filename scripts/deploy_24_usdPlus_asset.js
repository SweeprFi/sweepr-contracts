const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");
const { Const} = require("../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();
    deployer = deployer.address;

    const name = 'USDPlus Asset';
    const sweep = addresses.sweep;
    const usdc = addresses.usdc;
    const usdPlus = addresses.usdPlus;
    const usdcE = addresses.usdc_e;
    const exchanger = addresses.usdPlus_exchanger;
    const oracleUsdc = addresses.oracle_usdc_usd;
    const borrower = addresses.multisig;
    const poolFee = Const.FEE;

    console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

    const Asset = await ethers.getContractFactory("USDPlusAsset");
    const asset = await Asset.deploy(
        name,
        sweep,
        usdc,
        usdPlus,
        usdcE,
        exchanger,
        oracleUsdc,
        borrower,
        poolFee
    );

    console.log("USD+ Asset deployed to:", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${usdPlus} ${usdcE} ${exchanger} ${oracleUsdc} ${borrower} ${poolFee}`)
}

main();


const { ethers } = require("hardhat");
const { addresses, network } = require("../utils/address");
const { Const} = require("../utils/helper_functions");


async function main() {
    let deployer = '';
    const assetName = 'WETH Asset';
    const sweep = addresses.sweep;
    const usdc = addresses.usdc;
    const weth = addresses.weth;
    const oracleUsdc = addresses.oracle_usdc_usd;
    const oracleWeth = addresses.oracle_weth_usd;
    const borrower = addresses.borrower;
    const poolFee = Const.FEE;

    if (network.type === "0") { // local
        [deployer] = await ethers.getSigners();
        deployer = deployer.address;
    } else {
        deployer = addresses.owner;
    }

    console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

    const WETHAsset = await ethers.getContractFactory("TokenAsset");
    const wethAsset = await WETHAsset.deploy(
        assetName, 
        sweep, 
        usdc, 
        weth, 
        oracleUsdc,
        oracleWeth, 
        borrower,
        poolFee
    );

    console.log("WETH Asset deployed to:", wethAsset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${wethAsset.address} "${assetName}" ${sweep} ${usdc} ${weth} ${oracleUsdc} ${oracleWeth} ${borrower} ${poolFee}`)
}

main();


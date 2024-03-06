const { ethers } = require("hardhat");
const { ask } = require("../../../utils/helper_functions");
const { tokens, network, wallets, curve, chainlink } = require("../../../utils/constants");

async function main() {
    [deployer] = await ethers.getSigners();

    const name = 'Ethena Asset';
    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const usde = tokens.usde;
    const susde = tokens.susde;
    const oracleUsdc = chainlink.usdc_usd;
    const poolAddress = curve.pool_usde;
    const borrower = wallets.borrower;

    console.log("===========================================");
    console.log("ETHENA ASSET DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("Asset Name:", name);
    console.log("SWEEP:", sweep);
    console.log("USDC:", usdc);
    console.log("USDe:", usde);
    console.log("sUSDe:", susde);
    console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
    console.log("Pool Address (USDe/USDC):", poolAddress);
    console.log("Borrower:", borrower);
    console.log("===========================================");
    const answer = (await ask("continue? y/n: "));
    if (answer !== 'y') { process.exit(); }
    console.log("Deploying...");

    const Asset = await ethers.getContractFactory("EthenaAsset");
    const asset = await Asset.deploy(
        name,
        sweep,
        usdc,
        usde,
        susde,
        oracleUsdc,
        poolAddress,
        borrower
    );

    console.log("Ethena Asset deployed to:", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${usde} ${susde} ${oracleUsdc} ${poolAddress} ${borrower}`);
}

main();

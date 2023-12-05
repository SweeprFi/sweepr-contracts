const { ethers } = require("hardhat");
const { tokens, chainlink, wallets, protocols } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();

    const name = 'sFrax Asset';
    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const frax = tokens.frax;
    const sfrax = tokens.sfrax;
    const oracleUsdc = chainlink.usdc_usd;
    const oracleFrax = chainlink.frax_usd;
    const borrower = wallets.multisig;
    const poolAddress = protocols.balancer.frax_usdc;

    
    console.log("===========================================");
    console.log("FRAX ASSET DEPLOY");
    console.log("===========================================");
    console.log("Network:", network.name);
    console.log("Deployer:", deployer.address);
    console.log("===========================================");
    console.log("Asset Name:", assetName);
    console.log("SWEEP:", sweep);
    console.log("USDC:", usdc);
    console.log("FRAX:", frax);
    console.log("sFRAX:", sfrax);
    console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
    console.log("FRAX/USD Chainlink Oracle:", oracleFrax);
    console.log("Borrower:", borrower);
    console.log("FRAX/USDC poolAddress:", poolAddress);
    console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
    console.log("Deploying...");


    const Asset = await ethers.getContractFactory("SFraxAsset");
    const asset = await Asset.deploy(
        name,
        sweep,
        usdc,
        frax,
        sfrax,
        oracleUsdc,
        oracleFrax,
        borrower,
        poolAddress,
    );

    console.log("sFrax Asset deployed to:", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${frax} ${sfrax} ${oracleUsdc} ${oracleFrax} ${borrower} ${poolAddress}`)
}

main();
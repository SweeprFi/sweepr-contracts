const { ethers } = require("hardhat");
const { tokens, network, wallets, protocols, chainlink } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();

    const name = 'USDPlus Asset';
    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const usdcE = tokens.usd_bc;
    const usdPlus = protocols.overnight.usd_plus;
    const exchange = protocols.overnight.exchange;
    const oracleUsdc = chainlink.usdc_usd;
    const borrower = '0x68b2a7B9ca1D8C87A170e9Bb2e120cFd09Ef144F'; //wallets.multisig;
    const poolAddress = protocols.balancer.bpt_4pool;

    console.log("===========================================");
	console.log("USD+ ASSET DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("Asset Name:", name);
	console.log("SWEEP:", sweep);
	console.log("USDC:", usdc);
    console.log("USDC.e:", usdcE);
    console.log("USD+:", usdPlus);
    console.log("Exchanger:", exchange);
	console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
	console.log("Borrower:", borrower);
    console.log("Pool Address (USDC/USDC.e):", poolAddress);
	console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Deploying...");


    const Asset = await ethers.getContractFactory("USDPlusAsset");
    const asset = await Asset.deploy(
        name,
        sweep,
        usdc,
        usdPlus,
        usdcE,
        exchange,
        oracleUsdc,
        borrower,
        poolAddress
    );

    console.log("USD+ Asset deployed to:", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${usdPlus} ${usdcE} ${exchange} ${oracleUsdc} ${borrower} ${poolAddress}`)
}

main();


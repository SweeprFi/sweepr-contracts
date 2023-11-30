const { ethers } = require("hardhat");
const { wallets, protocols, tokens, chainlink, network } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();

    const name = 'DAI DSR Asset';
    const sweep = tokens.sweep;
    const usdc = tokens.usdc;
    const dai = tokens.dai;
    const dsrManager = protocols.dsr_manager;
    const dssPsm = protocols.dss_psm;
    const oracleUsdc = chainlink.usdc_usd;
    const oracleDai = chainlink.dai_usd;
    const borrower = wallets.multisig;


    console.log("===========================================");
	console.log("DAI DSR ASSET DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("Asset Name:", name);
	console.log("SWEEP:", sweep);
	console.log("USDC:", usdc);
    console.log("DAI:", dai);
    console.log("DSR Manager:", dsrManager);
	console.log("PSM Module:", dssPsm);
	console.log("USDC/USD Chainlink Oracle:", oracleUsdc);
    console.log("DAI/USD Chainlink Oracle:", oracleDai);
	console.log("Borrower:", borrower);
	console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Deploying...");


    const Asset = await ethers.getContractFactory("DsrAsset");
    const asset = await Asset.deploy(
        name,
        sweep,
        usdc,
        dai,
        dsrManager,
        dssPsm,
        oracleUsdc,
        oracleDai,
        borrower
    );

    console.log("DAI DSR Asset deployed to:", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${usdc} ${dai} ${dsrManager} ${dssPsm} ${oracleUsdc} ${oracleDai} ${borrower}`)
}

main();

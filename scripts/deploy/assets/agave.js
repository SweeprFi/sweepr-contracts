const { ethers } = require("hardhat");
const { tokens, wallets, protocols, chainlink, network } = require("../../../utils/constants");
const { ask } = require("../../../utils/helper_functions");

async function main() {
    [deployer] = await ethers.getSigners();

    const name = 'Agave Asset';
    const sweep = tokens.sweep;
    const wxdai = tokens.wxdai;
    const agwxdai = tokens.agwxdai;
    const pool = protocols.agave.pool;
    const oracle = chainlink.xdai_usd;
    const borrower = wallets.multisig;
    
    console.log("===========================================");
	console.log("AGAVE ASSET DEPLOY");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("Asset Name:", name);
	console.log("SWEEP:", sweep);
	console.log("wxDAI:", wxdai);
    console.log("agwxDAI:", agwxdai);
    console.log("Agave POOL:", pool);
    console.log("xDAI/USD Chainlink Oracle:", oracle);
	console.log("Borrower:", borrower);
	console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Deploying...");

    const Asset = await ethers.getContractFactory("AgaveAsset");
    const asset = await Asset.deploy(name, sweep, wxdai, agwxdai, pool, oracle, borrower);

    console.log("Agave Asset deployed to: ", asset.address);
    console.log(`\nnpx hardhat verify --network ${network.name} ${asset.address} "${name}" ${sweep} ${wxdai} ${agwxdai} ${pool} ${oracle} ${borrower}`);
}

main();


const { ethers } = require('hardhat');
const { deployments } = require("../../utils/constants");

async function main() {
	[account1, account2, executor] = await ethers.getSigners();

	balancer = await ethers.getContractAt("Balancer", deployments.balancer);
	console.log("Running interest rate update ...");

    let tx = await (await balancer.connect(executor).refreshInterestRate({value: ethers.utils.parseEther("0.05")})).wait();
	console.log(`tx: ${tx.transactionHash}`)

    console.log("... done");
}

main();

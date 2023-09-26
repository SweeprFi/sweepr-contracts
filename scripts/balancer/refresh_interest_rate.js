const { ethers } = require('hardhat');
const { addresses } = require("../../utils/address");

async function main() {
	[account1, account2, executor] = await ethers.getSigners();

	balancer = await ethers.getContractAt("Balancer", addresses.balancer);
	console.log("Running interest rate update ...");

    await (await balancer.connect(executor).refreshInterestRate({value: ethers.utils.parseEther("0.05")})).wait();

    console.log("... done");
}

main();

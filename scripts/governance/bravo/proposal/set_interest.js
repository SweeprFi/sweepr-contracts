const { ethers } = require('hardhat');
const { addresses } = require("../../../../utils/address");

async function main() {
	const NEW_INTEREST =  10000; // 1%
	const sweepAddress = addresses.sweep;
	const sweep_token = await ethers.getContractAt('SweepCoin', sweepAddress);
	const calldata = sweep_token.interface.encodeFunctionData('setInterestRate', [NEW_INTEREST]);
	const proposeDescription = "Proposal #5: Set interest rate";

	const Governance = await ethers.getContractAt("SweeprGovernor", addresses.governance);
  	await Governance.propose(
		  [sweepAddress],
		  [0], 
		  [calldata], 
		  proposeDescription
	);

	console.log("--- New Proposal Created for setting interest rate! ---");
}

main();

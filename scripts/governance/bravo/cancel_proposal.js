const { ethers } = require('hardhat');
const { addresses } = require("../../../utils/address");

async function main() {
	const sweepAddress = addresses.sweep;

	const sweep_token = await ethers.getContractAt('SweepCoin', sweepAddress);

	const calldata = sweep_token.interface.encodeFunctionData('acceptOwnership', []);
	const proposeDescription = "Proposal #1: Accept ownership";
	const descriptionHash = ethers.utils.id(proposeDescription);

	const Governance = await ethers.getContractAt("SweeprGovernor", addresses.governance);
  	await Governance.cancel(
		  [sweepAddress],
		  [0], 
		  [calldata], 
		  descriptionHash
	);

	console.log("--- Sent transaction to cancel proposal! ---");
}

main();

const { ethers } = require('hardhat');
const { addresses } = require("../../../utils/address");

async function main() {
	/*------- execute proposal for accepting ownership ----*/
	const sweepAddress = addresses.sweep;

	const sweep_token = await ethers.getContractAt('SweepDollarCoin', sweepAddress);

	const calldata = sweep_token.interface.encodeFunctionData('acceptOwnership', []);
	const proposeDescription = "Proposal #1: Accept ownership";
	const descriptionHash = ethers.utils.id(proposeDescription);

	const Governance = await ethers.getContractAt("SweepGovernor", addresses.governance);
  	await Governance.execute(
		  [sweepAddress],
		  [0], 
		  [calldata], 
		  descriptionHash
	);

	console.log("--- Sent transaction to execute proposal! ---");
}

main();

const { ethers } = require('hardhat');
const { addresses } = require("../../../../utils/address");

async function main() {
	const sweepAddress = addresses.sweep;
	const sweep_token = await ethers.getContractAt('SweepCoin', sweepAddress);
	const calldata = sweep_token.interface.encodeFunctionData('acceptOwnership', []);
	const proposeDescription = "Proposal #1: Accept ownership";

	const Governance = await ethers.getContractAt("SweepGovernor", addresses.governance);
	await Governance.propose(
		[sweepAddress],
		[0],
		[calldata],
		proposeDescription
	);

	console.log("--- New Proposal Created for accepting Sweep ownership! ---");
}

main();

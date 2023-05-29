const { ethers } = require('hardhat');
const { addresses } = require("../../../../utils/address");

async function main() {
	const sweepAddress = addresses.sweep;
	const sweep_token = await ethers.getContractAt('SweepCoin', sweepAddress);
	const calldata = sweep_token.interface.encodeFunctionData('startNewPeriod', []);
	const proposeDescription = "Proposal #3: Start new period";

	const Governance = await ethers.getContractAt("SweepGovernor", addresses.governance);
	await Governance.propose(
		[sweepAddress],
		[0],
		[calldata],
		proposeDescription
	);

	console.log("--- New Proposal Created for beginning new period! ---");
}

main();

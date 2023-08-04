const { ethers } = require('hardhat');
const { addresses } = require("../../../../utils/address");

async function main() {
	const sweepAddress = addresses.sweep;

	const sweep_token = await ethers.getContractAt('SweepCoin', sweepAddress);

	const calldata = sweep_token.interface.encodeFunctionData('pause', []);
	const proposeDescription = "Proposal #4: Pause Sweep";

	const Governance = await ethers.getContractAt("SweeprGovernor", addresses.governance);
  	await Governance.propose(
		  [sweepAddress],
		  [0], 
		  [calldata], 
		  proposeDescription
	);

	console.log("--- New Proposal Created for pausing Sweep! ---");
}

main();

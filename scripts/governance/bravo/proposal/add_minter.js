const { ethers } = require('hardhat');
const { addresses } = require("../../../../utils/address");

async function main() {
	const sweepAddress = addresses.sweep;
	const NEW_MINTER = addresses.asset_aave;
	const maxMintAmount = ethers.utils.parseUnits("100000", 18);

	const sweep_token = await ethers.getContractAt('SweepCoin', sweepAddress);
	const calldata = sweep_token.interface.encodeFunctionData('addMinter', [NEW_MINTER, maxMintAmount]);
	const proposeDescription = "Proposal #2: Adding new minter";

	const Governance = await ethers.getContractAt("SweeprGovernor", addresses.governance);
	await Governance.propose(
		[sweepAddress],
		[0],
		[calldata],
		proposeDescription
	);

	console.log("--- New Proposal Created for adding minter! ---");
}

main();

const CHAIN_ID = require("../utils/layerzero/chainIds.json");
const { getDeployedAddress } = require("../utils/address");

module.exports = async function (taskArgs, hre) {
	const senderAddress = getDeployedAddress(hre.network.name, "sender");
	const remoteAddress = getDeployedAddress(taskArgs.targetNetwork, "sweep");
	const minterAddress = taskArgs.minterAddress;
	const amount = ethers.utils.parseEther(taskArgs.amount);

	const payload = ethers.utils.defaultAbiCoder.encode(
		["address[]", "uint256[]", "string[]", "bytes[]"],
		[
			[remoteAddress],
			[0],
			["addMinter(address,uint256)"],
			[
				ethers.utils.defaultAbiCoder.encode(
					["address", "uint256"],
					[minterAddress, amount]
				),
			],
		]
	);

	console.log("\nPayload for adding minter:", payload);

	// get remote chain id
	const remoteChainId = CHAIN_ID[taskArgs.targetNetwork];
	console.log("\nRemote chain ID:", remoteChainId);

	// get local contract
	const localSenderInstance = await ethers.getContractAt(
		"OmnichainProposalSender",
		senderAddress
	);

	// quote fee with default adapterParams
	const adapterParams = ethers.utils.solidityPack(
		["uint16", "uint256"],
		[1, 200000]
	);
	console.log("\nAdapter params:", adapterParams);

	const nativeFee = (
		await localSenderInstance.estimateFees(
			remoteChainId,
			payload,
			adapterParams
		)
	).nativeFee;
	console.log(
		`\nFees (wei): ${nativeFee} / (eth): ${ethers.utils.formatEther(
			nativeFee
		)}\n`
	);
};

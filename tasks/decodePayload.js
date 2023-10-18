module.exports = async function (taskArgs, hre) {
	const payload = taskArgs.payload;
	const decoded = ethers.utils.defaultAbiCoder.decode(
		["address[]", "uint256[]", "string[]", "bytes[]"],
		payload
	);

	const targetAddress = decoded[0][0];
	console.log("\n");
	const signature = decoded[2][0];
	

	const arguments = signature.split("(")[1].replace(")", "").split(",");
	const params = ethers.utils.defaultAbiCoder.decode(arguments, decoded[3][0]);

	console.log("Target Address:", targetAddress)
	console.log("Function:", signature)

	for(let i=0; i<params.length; i++) {
		console.log(arguments[i], ":", params[i]);
	}

};

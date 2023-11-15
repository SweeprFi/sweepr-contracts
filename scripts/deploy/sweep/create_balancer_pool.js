const { ethers } = require('hardhat');
const { addresses, network } = require("../../../utils/address");
const { Const, sleep } = require('../../../utils/helper_functions');


async function main() {
	[deployer] = await ethers.getSigners();
	const sweep = addresses.sweep;
	const usdc = addresses.usdc;

	console.log("===========================================");
	console.log("CREATING BALANCER POOL");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("SWEEP:", addresses.sweep);
	console.log("USDC:", addresses.usdc);
	console.log("BalancerFactory:", addresses.balancer_factory);
	console.log("FEE:", 1e14/1e16);
	console.log("===========================================");
	console.log("Creating in 5 seconds...");
	await sleep(5);
	console.log("Creating...");


	const factory = await ethers.getContractAt("IComposableStablePoolFactory", addresses.balancer_factory);

	const sortTokensAndProviders = (sweep, token) => {
		data = {};

		if (token.toString().toLowerCase() < sweep.toString().toLowerCase()) {
			data.tokens = [token, sweep];
			data.providers = ['0x0000000000000000000000000000000000000000', addresses.balancer_amm];
		} else {
			data.tokens = [sweep, token];
			data.providers = [addresses.balancer_amm, '0x0000000000000000000000000000000000000000'];
		}

		return data;
	}

	// const pool = await factory.create(
	// 	"Balancer SWEEP-4POOL Stable Pool",
	// 	"SWEEP-4POOL-BTP",
	// 	[sweep, ]
	// ).wait();

	const data = sortTokensAndProviders(sweep, usdc);

	// TODO: sort tokens and rate providers
	const pool = await( await factory.create(
		"Balancer SWEEP-USDC StablePool",
		"SWEEP-USDC-BPT",
		data.tokens,
		500, // amplification
		data.providers, //rateProviders
		[10800, 10800], // tokenRateCacheDurations
		true, // exemptFromYieldProtocolFeeFlag
		1e14, // swapFeePercentage, 1e12 = 0.0001%
		'0xba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1b', // balancer governance
		'0x42616c616e6365722053574545502d5553444320537461626c65506f6f6c2031' // salt
	)).wait();

	console.log("===========================================");
	const poolAddress = pool.logs[0].address;
	console.log("poolAddress:", poolAddress);
	const poolContract = await ethers.getContractAt("IBalancerPool", poolAddress);
	console.log("pool id:", await poolContract.getPoolId());
}

main();

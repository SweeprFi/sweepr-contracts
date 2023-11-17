const { ethers } = require('hardhat');
const { tokens, network, balancer, deployments } = require("../../../utils/constants");
const { ask } = require('../../../utils/helper_functions');


async function main() {
	[deployer] = await ethers.getSigners();
	const sweep = tokens.sweep;
	const usdc = tokens.usdc;
	const amm = deployments.balancer_amm;
	const zero = '0x0000000000000000000000000000000000000000';
	const factory = balancer.factory;
	const poolFee = 1e14;

	const FACTORY = await ethers.getContractAt("IComposableStablePoolFactory", factory);

	const sortTokensAndProviders = (sweep, token) => {
		let data = {};

		if (token.toString().toLowerCase() < sweep.toString().toLowerCase()) {
			data.tokens = [token, sweep];
			data.providers = [zero, amm];
		} else {
			data.tokens = [sweep, token];
			data.providers = [amm, zero];
		}

		return data;
	}

	const sorted = sortTokensAndProviders(sweep, usdc);


	console.log("===========================================");
	console.log("CREATING BALANCER POOL");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("Deployer:", deployer.address);
	console.log("===========================================");
	console.log("SWEEP:", sweep);
	console.log("USDC:", usdc);
	console.log("AMM:", amm);
	console.log("BalancerFactory:", factory);
	console.log("Tokens:", sorted.tokens);
	console.log("Providers:", sorted.providers);
	console.log("FEE:", poolFee);
	console.log("FEE:", 100 * poolFee/1e18, '%');
	console.log("===========================================");
	
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Creating...");

	const pool = await( await FACTORY.create(
		"Balancer SWEEP-USDC StablePool",
		"SWEEP-USDC-BPT",
		sorted.tokens,
		500, // amplification
		sorted.providers, //rateProviders
		[10800, 10800], // tokenRateCacheDurations
		true, // exemptFromYieldProtocolFeeFlag
		poolFee, // swapFeePercentage, 1e18 = 100%
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

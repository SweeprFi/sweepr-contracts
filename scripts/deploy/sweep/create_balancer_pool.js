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

	// const pool = await factory.create(
	// 	"Balancer SWEEP-4POOL Stable Pool",
	// 	"SWEEP-4POOL-BTP",
	// 	[sweep, ]
	// ).wait();

	// TODO: sort tokens and rate providers
	const pool = await( await factory.create(
		"Balancer SWEEP-USDC Stable Pool",
		"SWEEP-USDC-BTP",
		[usdc, sweep],
		1, // amplification
		['0x0000000000000000000000000000000000000000', addresses.balancer_amm], //rateProviders
		[10800, 10800], // tokenRateCacheDurations
		true, // exemptFromYieldProtocolFeeFlag
		1e14, // swapFeePercentage, 1e12 = 0.0001%
		'0xba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1b', // balancer governance
		'0x0000000000000000000000000000000000000000000000000000000000001234' // salt
	)).wait();

	console.log("===========================================");
	const poolAddress = pool.logs[0].address;
	console.log("poolAddress:", poolAddress);
	const poolContract = await ethers.getContractAt("IBalancerPool", poolAddress);
	console.log("pool id:", await poolContract.getPoolId());
}

main();

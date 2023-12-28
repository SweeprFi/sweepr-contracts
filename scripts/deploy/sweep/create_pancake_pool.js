const { ethers } = require('hardhat');
const { network, tokens, pancake } = require("../../../utils/constants");
const { getPriceAndData, ask } = require('../../../utils/helper_functions');

async function main() {	
	const { token0, token1, sqrtPriceX96 } = getPriceAndData(tokens.sweep, tokens.usdc, 0, 0);
	const FEE = 500;

	console.log("===========================================");
	console.log("CREATING PANCAKE POOL");
	console.log("===========================================");
	console.log("Network:", network.name);
	console.log("===========================================");
	console.log("SWEEP:", tokens.sweep);
	console.log("USDC:", tokens.usdc);
	console.log("UniswapFactory:", pancake.factory);
	console.log("UniswapPositionManager:", pancake.positions_manager);
	console.log("sqrtPriceX96:", sqrtPriceX96);
	console.log("FEE:", FEE);
	console.log("Cardinality:", pancake.observationCardinality);
	console.log("===========================================");
	const answer = (await ask("continue? y/n: "));
    if(answer !== 'y'){ process.exit(); }
	console.log("Creating...");

	factory = await ethers.getContractAt("IUniswapV3Factory", pancake.factory);
	positionManager = await ethers.getContractAt("INonfungiblePositionManager", pancake.positions_manager);

	await (await positionManager.createAndInitializePoolIfNecessary(token0, token1, FEE, sqrtPriceX96)).wait();
	poolAddress = await factory.getPool(token0, token1, FEE);

	pool = await ethers.getContractAt("IPancakePool", poolAddress);
	slot0 = await pool.slot0();

	if (!sqrtPriceX96.eq(slot0.sqrtPriceX96)) {
		console.log(slot0.sqrtPriceX96);
		console.log(sqrtPriceX96);
		console.log("Wrong sqrtPriceX96 value !!");
	}

	console.log("===========================================");
	console.log(`Pool address on ${network.name} at: ${poolAddress}`);
}

main();

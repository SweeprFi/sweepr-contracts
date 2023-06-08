const { ethers } = require('hardhat');
const { addresses, network, cardinality } = require("../../utils/address");
const { Const, getPriceAndData } = require('../../utils/helper_functions');


async function main() {
	const { token0, token1, sqrtPriceX96 } =  getPriceAndData(addresses.sweep, addresses.usdc, 0, 0);

	factory = await ethers.getContractAt("IUniswapV3Factory", addresses.uniswap_factory);
    positionManager = await ethers.getContractAt("INonfungiblePositionManager", addresses.uniswap_position_manager);

	await (await positionManager.createAndInitializePoolIfNecessary(token0, token1, Const.FEE, sqrtPriceX96)).wait();
	poolAddress = await factory.getPool(token0, token1, Const.FEE);

	pool = await ethers.getContractAt("IUniswapV3Pool", poolAddress);
	slot0 = await pool.slot0();

	if(!sqrtPriceX96.eq(slot0.sqrtPriceX96)) {
		console.log(slot0.sqrtPriceX96);
		console.log(sqrtPriceX96);
		console.log("Wrong sqrtPriceX96 value !!");
	}

	console.log(`Pool address on ${network.name}: ${poolAddress}`);

	await (await pool.increaseObservationCardinalityNext(cardinality)).wait();

	console.log("Cardinality increased:", cardinality);
}

main();

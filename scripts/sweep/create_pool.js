const { ethers } = require('hardhat');
const { addresses, network, cardinality } = require("../../utils/address");
const { Const, toBN } = require('../../utils/helper_functions');


async function main() {
	const sweep = addresses.sweep.toString().toLowerCase();
	const usdc = addresses.usdc.toString().toLowerCase();

	let token0, token1, sqrtPriceX96;

	if (usdc < sweep) {
		token0 = usdc;
		token1 = sweep;
		sqrtPriceX96 = toBN("79228162514264337593543950336000000", 0);
	} else {
		token0 = sweep;
		token1 = usdc;
		sqrtPriceX96 = toBN("79228162514264334008320", 0);
	}

	factory = await ethers.getContractAt("IUniswapV3Factory", addresses.uniswap_factory);
    positionManager = await ethers.getContractAt("INonfungiblePositionManager", addresses.uniswap_position_manager);

	await (await positionManager.createAndInitializePoolIfNecessary(token0, token1, Const.FEE, sqrtPriceX96)).wait();
	poolAddress = await factory.getPool(usdc, sweep, Const.FEE);

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

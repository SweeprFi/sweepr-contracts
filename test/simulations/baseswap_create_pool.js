const { ethers } = require("hardhat");
const { tokens, chainlink, baseswap } = require("../../utils/constants");
const { resetNetwork } = require("../../utils/helper_functions");

contract("Baseswap new pool", async function () {
    return;
	before(async () => {
        await resetNetwork(10273813);

        sweep = tokens.sweep;
        usdc = tokens.usdc;
        positionManager = await ethers.getContractAt("INonfungiblePositionManager", baseswap.positions_manager);
        factory = await ethers.getContractAt("IUniswapV3Factory", baseswap.factory);

        LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
        liquidityHelper = await LiquidityHelper.deploy(baseswap.positions_manager);
	});

	it('Create pool', async () => {
        console.log("Deploying pool ==============>");
        token0 = usdc;
        token1 = sweep;
        FEE = 80;
        sqrtPriceX96 = 78364925180893756468006862214438770n;

        await positionManager.createAndInitializePoolIfNecessary(token0, token1, FEE, sqrtPriceX96);
        poolAddress = await factory.getPool(token0, token1, FEE);

        console.log("Pool created:", poolAddress)
        console.log("Deployin BaseswapAMM ==============>");

        AMM = await ethers.getContractFactory("BaseswapAMM");
        amm = await AMM.deploy(
            sweep,
            usdc,
            chainlink.sequencer,
            poolAddress,
            chainlink.usdc_usd,
            86400,
            liquidityHelper.address,
            baseswap.router
        );

        console.log("Checking price:", await amm.getPrice());
	});
});

const { expect } = require("chai");
const { expectRevert } = require('@openzeppelin/test-helpers');
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { Const } = require("../utils/helper_functions");
const { BigNumber } = require('ethers');
// const exp = require("constants");

let poolAddress;
let sqrtPriceX96, tickLower, tickUpper, token0, token1, token0Amount, token1Amount;

contract('Market Maker', async () => {
    before(async () => {
        [owner, borrower, treasury, guest, lzEndpoint, multisig] = await ethers.getSigners();

        usdxAmount = ethers.utils.parseUnits("10000000", 6); // 10M
        sweepAmount = ethers.utils.parseUnits("10000000", 18); // 10M
        minAutoSweepAmount = ethers.utils.parseUnits("100", 18);
        mintLPSweepAmount = ethers.utils.parseUnits("100", 18);
        increaseLPSweepAmount = ethers.utils.parseUnits("500", 18);
        TOP_SPREAD = 500; // 0.05%
        BOTTOM_SPREAD = 0;
        BORROWER = borrower.address;

        Sweep = await ethers.getContractFactory("SweepCoin");
        const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, multisig.address, 2500]);
        sweep = await Proxy.deployed();
        await sweep.setTreasury(treasury.address);

        ERC20 = await ethers.getContractFactory("USDCMock");
        usdc = await ERC20.deploy();

        LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
        liquidityHelper = await LiquidityHelper.deploy();

        factory = await ethers.getContractAt("IUniswapV3Factory", addresses.uniswap_factory);
        positionManager = await ethers.getContractAt("INonfungiblePositionManager", addresses.uniswap_position_manager);
        swapRouter = await ethers.getContractAt("ISwapRouter", addresses.uniswap_router);

        MarketMaker = await ethers.getContractFactory("MarketMaker");
        marketmaker = await MarketMaker.deploy(
            'Market Maker',
            sweep.address,
            usdc.address,
            liquidityHelper.address,
            BORROWER,
            TOP_SPREAD,
            BOTTOM_SPREAD
        );

        await sweep.addMinter(owner.address, sweepAmount.mul(5));
        await sweep.addMinter(marketmaker.address, sweepAmount);

        // sends usdx to owner for creating liquidity position in uniswap v3 pool
        await sweep.minter_mint(owner.address, sweepAmount.mul(5));
        await usdc.transfer(owner.address, usdxAmount.mul(5));

        // config market maker
        await marketmaker.connect(borrower).configure(
            0, // 0% equity ratio
            Const.SPREAD_FEE,
            sweepAmount,
            Const.DISCOUNT,
            Const.DAY,
            Const.RATIO,
            minAutoSweepAmount,
            Const.TRUE,
            Const.URL
        );

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapAMM");

        amm = await Uniswap.deploy(
            sweep.address,
            addresses.sequencer_feed,
            Const.FEE,
            usdc.address,
            usdOracle.address,
            86400
        );

        await sweep.setAMM(amm.address);
    });

    describe("main functions", async function () {
        it('create the pool and adds liquidity', async () => {
            expect(await factory.getPool(usdc.address, sweep.address, Const.FEE)).to.equal(Const.ADDRESS_ZERO);

            if (usdc.address < sweep.address) {
                sqrtPriceX96 = BigNumber.from('79228057781537899283318961129827820'); // price = 1.0
                tickLower = 276120; // 0.98
                tickUpper = 276520; // 1.02

                token0 = usdc.address;
                token1 = sweep.address;

                token0Amount = usdxAmount;
                token1Amount = sweepAmount;
            } else {
                sqrtPriceX96 = BigNumber.from('79228162514264337593543'); // price = 1.0
                tickLower = -276520; // 0.98
                tickUpper = -276120; // 1.02

                token0 = sweep.address;
                token1 = usdc.address;

                token0Amount = sweepAmount;
                token1Amount = usdxAmount;
            }

            await positionManager.createAndInitializePoolIfNecessary(token0, token1, Const.FEE, sqrtPriceX96)
            poolAddress = await factory.getPool(sweep.address, usdc.address, Const.FEE);

            expect(poolAddress).to.not.equal(Const.ADDRESS_ZERO);

            await sweep.approve(positionManager.address, sweepAmount.mul(5));
		    await usdc.approve(positionManager.address, usdxAmount.mul(5));

            expect(await usdc.balanceOf(poolAddress)).to.equal(Const.ZERO);
            expect(await sweep.balanceOf(poolAddress)).to.equal(Const.ZERO);

            await positionManager.mint(
                {
                    token0: token0,
                    token1: token1,
                    fee: Const.FEE,
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    amount0Desired: token0Amount,
                    amount1Desired: token1Amount,
                    amount0Min: 0,
                    amount1Min: 0,
                    recipient: marketmaker.address,
                    deadline: 2105300114
                }
            );

            expect(await usdc.balanceOf(poolAddress)).to.greaterThan(Const.ZERO);
            expect(await sweep.balanceOf(poolAddress)).to.greaterThan(Const.ZERO);
        });

        it('deposit usdc to the Marketmaker', async () => {
            expect(await usdc.balanceOf(marketmaker.address)).to.equal(Const.ZERO);
            await usdc.transfer(marketmaker.address, usdxAmount.mul(4));
            expect(await usdc.balanceOf(marketmaker.address)).to.equal(usdxAmount.mul(4));
        });

        it('sell sweep', async () => {
            // swap 1M usdc to sweep, so price will rise up
            swapAmount = ethers.utils.parseUnits("1000000", 6);

            await sweep.approve(swapRouter.address, swapAmount.mul(7));
            await usdc.approve(swapRouter.address, usdxAmount.mul(7));

            await swapRouter.exactInputSingle({
                tokenIn: usdc.address,
                tokenOut: sweep.address,
                fee: 500,
                recipient: marketmaker.address,
                deadline: 2105300114,
                amountIn: swapAmount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
                }
            );

            usdcBeforeBalance = await usdc.balanceOf(marketmaker.address);
            sweepBeforeBalance = await sweep.balanceOf(marketmaker.address);

            expect(await marketmaker.sweep_borrowed()).to.equal(Const.ZERO);

            // call execute. it will call sellSweep() function, because SWEEP.amm_price() > arb_price_upper
            await sweep.approve(amm.address, sweepAmount.mul(5));
		    await usdc.approve(amm.address, usdxAmount.mul(5));

            executeAmount = ethers.utils.parseUnits("500000", 18);
            await marketmaker.connect(borrower).execute(executeAmount);

            expect(await marketmaker.sweep_borrowed()).to.equal(executeAmount);
        });

        it('revert calling setTopSpread when caller is not borrower', async () => {
            await expect(marketmaker.connect(guest).setTopSpread(1100))
                .to.be.revertedWithCustomError(MarketMaker, 'NotBorrower');
        });

        it('setTopSpread correctly', async () => {
            const newTopSpread = 2000; // 0.2%
            await marketmaker.connect(borrower).setTopSpread(newTopSpread);

            expect(await marketmaker.top_spread()).to.equal(newTopSpread);
        });

        it('revert calling setBottomSpread when caller is not borrower', async () => {
            await expect(marketmaker.connect(guest).setBottomSpread(1000))
                .to.be.revertedWithCustomError(MarketMaker, 'NotBorrower');
        });

        it('setTopSpread correctly', async () => {
            const newBottomSpread = 1000; // 0.1%
            await marketmaker.connect(borrower).setBottomSpread(newBottomSpread);

            expect(await marketmaker.bottom_spread()).to.equal(newBottomSpread);
        });

        it('removes closed positions', async () => {
            swapAmount = ethers.utils.parseUnits("5000000", 18);

            await sweep.approve(swapRouter.address, swapAmount.mul(7));
		    await usdc.approve(swapRouter.address, usdxAmount.mul(7));

            // swap 5M sweep
            await swapRouter.exactInputSingle({
                tokenIn: sweep.address,
                tokenOut: usdc.address,
                fee: 500,
                recipient: marketmaker.address,
                deadline: 2105300114,
                amountIn: swapAmount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
                }
            );

            pool = await ethers.getContractAt("IUniswapV3Pool", poolAddress);
            poolData = await pool.slot0();
            currentTick = poolData.tick;

            // check currentTick is below than the tick of target price(276320 or -276320)
            if (usdc.address < sweep.address) {
                targetPriceTick = -276320; // 1.0
            } else {
                targetPriceTick = 276320; // 1.0
            }

            expect(currentTick).to.below(targetPriceTick)
            expect(await marketmaker.numPositions()).to.equal(1);

            const tokenId1 = (await positionManager.tokenOfOwnerByIndex(marketmaker.address, 1)).toNumber();
            positionMapping1 = await marketmaker.positions_mapping(tokenId1);
		    expect(positionMapping1.liquidity).to.above(Const.ZERO);

            // Call removeClosedPositions(), but it willl remove 1nd position,
            // because current tick is below than tick_upper of 1nd position.
            await marketmaker.execute(0);
            expect(await marketmaker.numPositions()).to.equal(0);

            // confirm 1st position was removed
            positionMapping1 = await marketmaker.positions_mapping(tokenId1);
            expect(positionMapping1.liquidity).to.equal(Const.ZERO);
		    expect(positionMapping1.tokenId).to.equal(undefined);
        });
    })
});

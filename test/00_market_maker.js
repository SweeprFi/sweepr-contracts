const { expect } = require("chai");
const { expectRevert } = require('@openzeppelin/test-helpers');
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { Const } = require("../utils/helper_functions");
const { BigNumber } = require('ethers');
const exp = require("constants");

let poolAddress;

contract('Market Maker', async () => {
    before(async () => {
        [owner, borrower, treasury, guest, lzEndpoint] = await ethers.getSigners();

        usdxAmount = ethers.utils.parseUnits("10000", 6);
        mintLPUsdxAmount = 100e6;
        increaseLPUsdxAmount = 500e6;
        sweepAmount = ethers.utils.parseUnits("10000", 18);
        minAutoSweepAmount = ethers.utils.parseUnits("100", 18);
        mintLPSweepAmount = ethers.utils.parseUnits("100", 18);
        increaseLPSweepAmount = ethers.utils.parseUnits("500", 18);
        TOP_SPREAD = 1000; // 0.1%
        BOTTOM_SPREAD = 0;
        BORROWER = borrower.address;

        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
        sweep = await Proxy.deployed();
        await sweep.setTreasury(treasury.address);

        ERC20 = await ethers.getContractFactory("USDCMock");
        usdc = await ERC20.deploy();

        LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
        liquidityHelper = await LiquidityHelper.deploy();

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapAMM");
        amm = await Uniswap.deploy(sweep.address, 500, usdOracle.address, Const.ADDRESS_ZERO);

        factory = await ethers.getContractAt("IUniswapV3Factory", addresses.uniswap_factory);
        positionManager = await ethers.getContractAt("INonfungiblePositionManager", Const.NFT_POSITION_MANAGER);
        swapRouter = await ethers.getContractAt("ISwapRouter", addresses.uniswap_router);

        MarketMaker = await ethers.getContractFactory("MarketMaker");
        marketmaker = await MarketMaker.deploy(
            'Market Maker',
            sweep.address,
            usdc.address,
            liquidityHelper.address,
            amm.address,
            BORROWER,
            TOP_SPREAD,
            BOTTOM_SPREAD
        );

        await sweep.addMinter(owner.address, sweepAmount.mul(5));
        await sweep.addMinter(marketmaker.address, sweepAmount);

        // sends sweep and usdx to owner for creating liquidity position in uniswap v3 pool
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
    });

    describe("main functions", async function () {
        it('create the pool and adds liquidity', async () => {
            expect(await factory.getPool(usdc.address, sweep.address, 500)).to.equal(Const.ADDRESS_ZERO);

            let sqrtPriceX96, tickLower, tickUpper, token0, token1, token0Amount, token1Amount;

            if (usdc.address < sweep.address) {
                sqrtPriceX96 = BigNumber.from('79228057781537899283318961129827820'); // price = 1.0
                tickLower = 275370;
                tickUpper = 277280;

                token0 = usdc.address;
                token1 = sweep.address;

                token0Amount = usdxAmount;
                token1Amount = sweepAmount;
            } else {
                sqrtPriceX96 = BigNumber.from('79228162514264337593543'); // price = 1.0
                tickLower = -277280; // 0.9
                tickUpper = -275370; // 1.1

                token0 = sweep.address;
                token1 = usdc.address;

                token0Amount = sweepAmount;
                token1Amount = usdxAmount;
            }

            await positionManager.createAndInitializePoolIfNecessary(token0, token1, 500, sqrtPriceX96)
            poolAddress = await factory.getPool(sweep.address, usdc.address, 500);

            expect(poolAddress).to.not.equal(Const.ADDRESS_ZERO);

            await sweep.approve(positionManager.address, sweepAmount.mul(5));
		    await usdc.approve(positionManager.address, usdxAmount.mul(5));

            expect(await usdc.balanceOf(poolAddress)).to.equal(Const.ZERO);
            expect(await sweep.balanceOf(poolAddress)).to.equal(Const.ZERO);

            await positionManager.mint(
                {
                    token0: token0,
                    token1: token1,
                    fee: 500,
                    tickLower: tickLower, // 0.9
                    tickUpper: tickUpper, // 1.1
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

        it('revert calling execute if caller is not borrower', async () => {
            await expect(marketmaker.connect(guest).execute(sweepAmount))
                .to.be.revertedWithCustomError(MarketMaker, 'OnlyBorrower');
        });

        it('sell sweep', async () => {
            // set target price to 0.9
            currentTargetPrice = 1e6;
            nextTargetPrice = 0.9e6;

            await sweep.setTargetPrice(currentTargetPrice, nextTargetPrice);
            expect(await sweep.target_price()).to.equal(nextTargetPrice);

            usdcBeforeBalance = await usdc.balanceOf(marketmaker.address);
            sweepBeforeBalance = await sweep.balanceOf(marketmaker.address);

            expect(await marketmaker.sweep_borrowed()).to.equal(Const.ZERO);

            // call execute. it will call sellSweep() function, because SWEEP.amm_price() > arb_price_upper
            await sweep.approve(amm.address, sweepAmount.mul(5));
		    await usdc.approve(amm.address, usdxAmount.mul(5));

            executeAmount = ethers.utils.parseUnits("2000", 18);
            await marketmaker.connect(borrower).execute(executeAmount);

            expect(await marketmaker.sweep_borrowed()).to.equal(executeAmount);

            usdcAfterBalance = await usdc.balanceOf(marketmaker.address);
            sweepAfterBalance = await sweep.balanceOf(marketmaker.address);

            // check usdc balance of marketmaker
            expect(usdcAfterBalance).to.greaterThan(usdcBeforeBalance);
        });

        it('buy sweep', async () => {
            // set target price to 1.1
            currentTargetPrice = 0.9e6;
            nextTargetPrice = 1.1e6;

            await sweep.setTargetPrice(currentTargetPrice, nextTargetPrice);
            expect(await sweep.target_price()).to.equal(nextTargetPrice);

            usdcBeforeBalance = await usdc.balanceOf(marketmaker.address);
            beforeBorrowedAmount = await marketmaker.sweep_borrowed();

            // call execute. it will call buySweep() function, 
            // because SWEEP.amm_price() < arb_price_lower && usdc_balance > 0
            executeAmount = ethers.utils.parseUnits("1000", 18);
            await marketmaker.connect(borrower).execute(executeAmount);

            // check usdc balance of marketmaker
            usdcAfterBalance = await usdc.balanceOf(marketmaker.address);
            afterBorrowedAmount = await marketmaker.sweep_borrowed();

            expect(usdcAfterBalance).to.lessThan(usdcBeforeBalance);
            expect(afterBorrowedAmount).to.lessThan(beforeBorrowedAmount);
        });

        it('revert calling setTopSpread when caller is not borrower', async () => {
            await expect(marketmaker.connect(guest).setTopSpread(1100))
                .to.be.revertedWithCustomError(MarketMaker, 'OnlyBorrower');
        });

        it('setTopSpread correctly', async () => {
            const newTopSpread = 2000; // 0.2%
            await marketmaker.connect(borrower).setTopSpread(newTopSpread);

            expect(await marketmaker.top_spread()).to.equal(newTopSpread);
        });

        it('revert calling setBottomSpread when caller is not borrower', async () => {
            await expect(marketmaker.connect(guest).setBottomSpread(1000))
                .to.be.revertedWithCustomError(MarketMaker, 'OnlyBorrower');
        });

        it('setTopSpread correctly', async () => {
            const newBottomSpread = 1000; // 0.1%
            await marketmaker.connect(borrower).setBottomSpread(newBottomSpread);

            expect(await marketmaker.bottom_spread()).to.equal(newBottomSpread);
        });

        it('revert calling addSingleLiquidity when caller is not borrower', async () => {
            await expect(
                marketmaker.connect(guest).addSinglLiquidity(
                    800000,
                    900000,
                    usdxAmount,
                    sweepAmount
                )
            ).to.be.revertedWithCustomError(MarketMaker, 'OnlyBorrower');
        });

        it('revert calling addSingleLiquidity when adding 2 tokens', async () => {
            await expectRevert(
                marketmaker.connect(borrower).addSinglLiquidity(
                    800000,
                    900000,
                    usdxAmount,
                    sweepAmount
                ), 
                "not one token"
            );
        });

        it('add single-sided liquidity correctly', async () => {
            // check all position count of marketmaker is 1
            expect(await positionManager.balanceOf(marketmaker.address)).to.equal(1);
            // check position count for single-sided liquidity is 0
            expect(await marketmaker.numPositions()).to.equal(0);

            await marketmaker.connect(borrower).addSinglLiquidity(
                800000, // 0.8
                900000, // 0.9
                usdxAmount,
                0
            );

            // check all position count of marketmaker is 2 after adding single-sided liquidity
            expect(await positionManager.balanceOf(marketmaker.address)).to.equal(2);
            // check position count for single-sided liquidity is 1
            expect(await marketmaker.numPositions()).to.equal(1);

		    const tokenId = (await positionManager.tokenOfOwnerByIndex(marketmaker.address, 1)).toNumber();
		    const position = await positionManager.positions(tokenId);
		    const liquidity = position.liquidity;

            expect(tokenId).to.not.equal(Const.ZERO);
            expect(liquidity).to.above(Const.ZERO);

            const positionMapping = await marketmaker.positions_mapping(tokenId);
            expect(positionMapping.liquidity).to.above(Const.ZERO);
            expect(positionMapping.liquidity).to.equal(liquidity);
            expect(positionMapping.tick_lower).to.not.equal(Const.ZERO);
            expect(positionMapping.tick_upper).to.not.equal(Const.ZERO);
        });

        it('revert calling removeLiquidity() when caller is not borrower', async () => {
            await expect(marketmaker.connect(guest).removeLiquidity(0))
                .to.be.revertedWithCustomError(MarketMaker, 'OnlyBorrower');
        });

        it('revert calling removeClosedPositions() when caller is not borrower', async () => {
            await expect(marketmaker.connect(guest).removeOutOfPositions())
                .to.be.revertedWithCustomError(MarketMaker, 'OnlyBorrower');
        });

        it('removes closed positions', async () => {
            swapAmount = ethers.utils.parseUnits("10000", 18);

            await sweep.approve(swapRouter.address, swapAmount.mul(7));
		    await usdc.approve(swapRouter.address, usdxAmount.mul(7));

            // swap 10K sweep
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

            // check currentTick is out of 1st position range [-277280,-275370] (0.9, 1.1)
            const tokenId0 = (await positionManager.tokenOfOwnerByIndex(marketmaker.address, 0)).toNumber();
		    const position0 = await positionManager.positions(tokenId0);
            expect(currentTick).to.below(position0.tickLower)
            expect(currentTick).to.below(position0.tickUpper)

            // check currentTick is in 2st position range [-278550,-277370] (0.8, 0.9)
            tokenId1 = (await positionManager.tokenOfOwnerByIndex(marketmaker.address, 1)).toNumber();
		    position1 = await positionManager.positions(tokenId1);
            expect(currentTick).to.below(position1.tickUpper)
            expect(currentTick).to.above(position1.tickLower)
           
            // Call removeClosedPositions(), but it willl not remove liquidity,
            // because there is no closed position(2nd position is still active)
            await marketmaker.connect(borrower).removeOutOfPositions();

            expect(await marketmaker.numPositions()).to.equal(1);

            // add 3rd position
            await marketmaker.connect(borrower).addSinglLiquidity(
                700000, // 0.7
                800000, // 0.8
                usdxAmount,
                0
            );

            expect(await marketmaker.numPositions()).to.equal(2);

            const tokenId2 = (await positionManager.tokenOfOwnerByIndex(marketmaker.address, 2)).toNumber();
            const positionMapping2 = await marketmaker.positions_mapping(tokenId2);
		    expect(positionMapping2.liquidity).to.above(Const.ZERO);

            // swap 15K sweep
            swapAmount = ethers.utils.parseUnits("15000", 18);
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

            // check currentTick is out of 2st position range [-278550,-277370] (0.8, 0.9)
            tokenId1 = (await positionManager.tokenOfOwnerByIndex(marketmaker.address, 1)).toNumber();
		    position1 = await positionManager.positions(tokenId1);
            expect(currentTick).to.below(position1.tickUpper)
            expect(currentTick).to.below(position1.tickLower)

            // Call removeClosedPositions(), but it willl remove 2nd position,
            // because 2nd position is out of range.
            await marketmaker.connect(borrower).removeOutOfPositions();
            expect(await marketmaker.numPositions()).to.equal(1);

            // confirm 2nd position was removed
            const positionMapping1 = await marketmaker.positions_mapping(tokenId1);
            expect(positionMapping1.liquidity).to.equal(Const.ZERO);
		    expect(positionMapping1.tokenId).to.equal(undefined);
        });
    })
});

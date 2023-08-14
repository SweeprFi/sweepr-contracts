const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { Const, getPriceAndData, toBN } = require("../utils/helper_functions");

let poolAddress;

contract('Market Maker', async () => {
    before(async () => {
        [owner, borrower, treasury, guest, lzEndpoint, multisig] = await ethers.getSigners();

        usdxAmount = toBN("10000000", 6); // 10M
        sweepAmount = toBN("10000000", 18); // 10M
        minAutoSweepAmount = toBN("100", 18);
        mintLPSweepAmount = toBN("100", 18);
        increaseLPSweepAmount = toBN("500", 18);
        TOP_SPREAD = 500; // 0.05%
        BOTTOM_SPREAD = 0;
        TICK_SPREAD = 1000; // 0.1%
        BORROWER = borrower.address;

        Sweep = await ethers.getContractFactory("SweepCoin");
        const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, multisig.address, 2500]);
        sweep = await Proxy.deployed();
        await sweep.setTreasury(treasury.address);

        ERC20 = await ethers.getContractFactory("USDCMock");
        usdc = await ERC20.deploy();

        LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
        liquidityHelper = await LiquidityHelper.deploy();

        Oracle = await ethers.getContractFactory("AggregatorMock");
        usdcOracle = await Oracle.deploy();
        await usdcOracle.setPrice(Const.USDC_PRICE);

        factory = await ethers.getContractAt("IUniswapV3Factory", addresses.uniswap_factory);
        positionManager = await ethers.getContractAt("INonfungiblePositionManager", addresses.uniswap_position_manager);
        swapRouter = await ethers.getContractAt("ISwapRouter", addresses.uniswap_router);

        MarketMaker = await ethers.getContractFactory("MarketMaker");
        marketmaker = await MarketMaker.deploy(
            'Market Maker',
            sweep.address,
            usdc.address,
            liquidityHelper.address,
			addresses.oracle_usdc_usd,
            BORROWER,
            TOP_SPREAD,
            BOTTOM_SPREAD,
            TICK_SPREAD
        );

        await sweep.addMinter(owner.address, sweepAmount.mul(5));
        await sweep.addMinter(marketmaker.address, sweepAmount);

        // sends usdx to owner for creating liquidity position in uniswap v3 pool
        await sweep.connect(owner).mint(sweepAmount.mul(5));
        await usdc.transfer(owner.address, usdxAmount.mul(5));

        // config market maker
        await marketmaker.connect(borrower).configure(
            0,
            Const.spreadFee,
            sweepAmount,
            Const.DISCOUNT,
            Const.DAY,
            Const.RATIO,
            minAutoSweepAmount,
            Const.TRUE,
            Const.URL
        );

        Uniswap = await ethers.getContractFactory("UniswapAMM");
        amm = await Uniswap.deploy(
            sweep.address,
            usdc.address,
            addresses.sequencer_feed,
            Const.FEE,
            usdcOracle.address,
            86400
        );

        await sweep.setAMM(amm.address);
    });

    describe("main functions", async function () {
        it('create the pool and adds liquidity', async () => {
            expect(await factory.getPool(usdc.address, sweep.address, Const.FEE)).to.equal(Const.ADDRESS_ZERO);

            const { token0, token1, tickLower, tickUpper, sqrtPriceX96, token0Amount, token1Amount } =
                getPriceAndData(sweep.address, usdc.address, sweepAmount, usdxAmount);

            await positionManager.createAndInitializePoolIfNecessary(token0, token1, Const.FEE, sqrtPriceX96)
            poolAddress = await factory.getPool(token0, token1, Const.FEE);

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
            expect(await marketmaker.sweepBorrowed()).to.equal(Const.ZERO);
            // swap 1M usdc to sweep, so price will rise up
            swapAmount = toBN("1000000", 6);

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
            });

            sweepPrice = await sweep.ammPrice();
            usdcPoolBalance = await usdc.balanceOf(poolAddress);
            sweepPoolBalance = await sweep.balanceOf(poolAddress);
            // call execute. it will call sellSweep() function,
            // because SWEEP.ammPrice() > arb_price_upper
            await sweep.approve(amm.address, sweepAmount.mul(5));
            await usdc.approve(amm.address, usdxAmount.mul(5));

            executeAmount = toBN("500000", 18);
            await marketmaker.connect(borrower).execute(executeAmount);

            expect(await marketmaker.sweepBorrowed()).to.equal(executeAmount);
            expect(await sweep.ammPrice()).to.not.greaterThan(sweepPrice);
            expect(await usdc.balanceOf(poolAddress)).to.equal(usdcPoolBalance);
            expect(await sweep.balanceOf(poolAddress)).to.greaterThan(sweepPoolBalance);
        });

        it('sell sweep again', async () => {
            execute2Amount = toBN("300000", 18);
            sweepPrice = await sweep.ammPrice();
            sweepPoolBalance = await sweep.balanceOf(poolAddress);

            await marketmaker.connect(borrower).execute(execute2Amount);

            expect(await marketmaker.sweepBorrowed()).to.equal(executeAmount.add(execute2Amount));
            expect(await sweep.ammPrice()).to.not.greaterThan(sweepPrice);
            expect(await usdc.balanceOf(poolAddress)).to.equal(usdcPoolBalance);
            expect(await sweep.balanceOf(poolAddress)).to.greaterThan(sweepPoolBalance);
        });

        it('does nothing, because the price is in range', async () => {
            execute3Amount = toBN("100000", 18);
            sweepPrice = await sweep.ammPrice();
            sweepPoolBalance = await sweep.balanceOf(poolAddress);

            await marketmaker.connect(borrower).execute(execute3Amount);

            expect(await marketmaker.sweepBorrowed()).to.equal(executeAmount.add(execute2Amount));
            expect(await sweep.ammPrice()).to.equal(sweepPrice);
            expect(await usdc.balanceOf(poolAddress)).to.equal(usdcPoolBalance);
            expect(await sweep.balanceOf(poolAddress)).to.equal(sweepPoolBalance);
        });

        it('revert calling setTopSpread when caller is not borrower', async () => {
            await expect(marketmaker.connect(guest).setTopSpread(1100))
                .to.be.revertedWithCustomError(MarketMaker, 'NotBorrower');
        });

        it('setTopSpread correctly', async () => {
            const newTopSpread = 2000; // 0.2%
            await marketmaker.connect(borrower).setTopSpread(newTopSpread);

            expect(await marketmaker.topSpread()).to.equal(newTopSpread);
        });

        it('revert calling setBottomSpread when caller is not borrower', async () => {
            await expect(marketmaker.connect(guest).setBottomSpread(1000))
                .to.be.revertedWithCustomError(MarketMaker, 'NotBorrower');
        });

        it('setBottomSpread correctly', async () => {
            const newBottomSpread = 1000; // 0.1%
            await marketmaker.connect(borrower).setBottomSpread(newBottomSpread);

            expect(await marketmaker.bottomSpread()).to.equal(newBottomSpread);
        });

        it('setTickSpread correctly', async () => {
            const newTickSpread = 2000; // 0.2%
            await marketmaker.connect(borrower).setTickSpread(newTickSpread);

            expect(await marketmaker.tickSpread()).to.equal(newTickSpread);
        });

        it('removes closed positions', async () => {
            swapAmount = toBN("5000000", 18);
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
            });

            pool = await ethers.getContractAt("IUniswapV3Pool", poolAddress);
            poolData = await pool.slot0();
            currentTick = poolData.tick;

            // check currentTick is below or above than the tick of target price(276320 or -276320)
            if (usdc.address < sweep.address) {
                targetPriceTick = 276320; // 1.0
                expect(currentTick).to.above(targetPriceTick)
            } else {
                targetPriceTick = -276320; // 1.0
                expect(currentTick).to.below(targetPriceTick)
            }

            expect(await marketmaker.numPositions()).to.equal(2);

            const tokenId1 = (await positionManager.tokenOfOwnerByIndex(marketmaker.address, 1)).toNumber();
            positionMapping1 = await marketmaker.positions(tokenId1);
            expect(positionMapping1.liquidity).to.above(Const.ZERO);

            const tokenId2 = (await positionManager.tokenOfOwnerByIndex(marketmaker.address, 2)).toNumber();
            positionMapping2 = await marketmaker.positions(tokenId2);
            expect(positionMapping2.liquidity).to.above(Const.ZERO);

            usdcPoolBalance = await usdc.balanceOf(poolAddress);
            sweepPoolBlance = await sweep.balanceOf(poolAddress);
            usdcAssetBalance = await usdc.balanceOf(marketmaker.address);
            sweepAssetBalance = await sweep.balanceOf(marketmaker.address);

            sweepPrice = await sweep.ammPrice();

            // Call removeClosedPositions(), but it willl remove 1nd position,
            // because current tick is below than tick_upper of 1nd position.
            await marketmaker.execute(0);

            // confirm 1st position was removed
            positionMapping1 = await marketmaker.positions(tokenId1);
            expect(positionMapping1.liquidity).to.equal(Const.ZERO);

            // confirm 2nd position was removed
            positionMapping2 = await marketmaker.positions(tokenId2);
            expect(positionMapping2.liquidity).to.equal(Const.ZERO);

            expect(await usdc.balanceOf(poolAddress)).to.equal(usdcPoolBalance);
            expect(await sweep.balanceOf(poolAddress)).to.greaterThan(sweepPoolBalance);
            expect(await usdc.balanceOf(marketmaker.address)).to.equal(usdcAssetBalance)
            expect(await sweep.balanceOf(marketmaker.address)).to.greaterThan(sweepAssetBalance);

            expect(await sweep.ammPrice()).to.equals(sweepPrice);
        });

        it('buys sweep from MM directly', async () => {
            // Rise the sweep price to mint
            usdcAmount = toBN("10000000", 6);
            await swapRouter.exactInputSingle({
                tokenIn: usdc.address,
                tokenOut: sweep.address,
                fee: 500,
                recipient: marketmaker.address,
                deadline: 2105300114,
                amountIn: usdcAmount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

            balance = toBN("3000", 6);
            await sweep.setArbSpread(3000);
            await usdc.transfer(guest.address, balance);
            await usdc.connect(guest).approve(marketmaker.address, balance);

            // vars
            exceededAmount = toBN("20000000", 18);
            amount = toBN("1000", 18);
            precision = toBN("1", 6);
            decimals = toBN("1", 18);
            // calculate price and amount to pay
            targetPrice = await sweep.targetPrice();
            spread = await sweep.arbSpread();
            spread = spread.mul(targetPrice).div(precision)
            price = targetPrice.add(spread);
            newAmount = amount.mul(price).div(decimals);

            // get prev state
            usdcBalanceBefore = await usdc.balanceOf(guest.address);
            sweepBalanceBefore = await sweep.balanceOf(guest.address);
            usdcPoolBalanceBefore = await usdc.balanceOf(poolAddress);
            sweepPoolBalanceBefore = await sweep.balanceOf(poolAddress);

            expect(usdcBalanceBefore).to.be.equal(balance);
            expect(sweepBalanceBefore).to.be.equal(Const.ZERO);

            await expect(marketmaker.connect(guest).buySweep(exceededAmount))
                .to.be.revertedWithCustomError(marketmaker, "NotEnoughBalance");

            await marketmaker.connect(guest).buySweep(amount);

            // check the new state
            expect(await usdc.balanceOf(guest.address)).to.be.equal(usdcBalanceBefore.sub(newAmount));
            expect(await sweep.balanceOf(guest.address)).to.be.equal(amount);
            expect(await usdc.balanceOf(poolAddress)).to.be.greaterThan(usdcPoolBalanceBefore);
            expect(await sweep.balanceOf(poolAddress)).to.be.equal(sweepPoolBalanceBefore);
        });
    })
});

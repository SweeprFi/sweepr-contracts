const { expect } = require("chai");
const { ethers } = require("hardhat");
const { chainlink, uniswap } = require("../../utils/constants");
const { Const, getPriceAndData, toBN } = require("../../utils/helper_functions");
let poolAddress;

contract.only('Uniswap Market Maker', async () => {
  before(async () => {
    [owner, borrower, treasury, guest, lzEndpoint, multisig, balancer] = await ethers.getSigners();
  
    usdxAmount = toBN("10000000", 6); // 10M
    sweepAmount = toBN("10000000", 18); // 10M
    minAutoSweepAmount = toBN("100", 18);
    BORROWER = owner.address;
    FEE = 500;
    TICK_SPREAD = 1000;

    Sweep = await ethers.getContractFactory("SweepCoin");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, multisig.address, 2500]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);

    ERC20 = await ethers.getContractFactory("USDCMock");
    usdc = await ERC20.deploy(6);

    LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
    liquidityHelper = await LiquidityHelper.deploy();

    Oracle = await ethers.getContractFactory("AggregatorMock");
    usdcOracle = await Oracle.deploy();
    await usdcOracle.setPrice(Const.USDC_PRICE);

    positionManager = await ethers.getContractAt("INonfungiblePositionManager", uniswap.positions_manager);
    factory = await ethers.getContractAt("IUniswapV3Factory", uniswap.factory);
    swapRouter = await ethers.getContractAt("ISwapRouter", uniswap.router);

    MarketMaker = await ethers.getContractFactory("UniswapMarketMaker");
    marketmaker = await MarketMaker.deploy(
      'Uniswap Market Maker',
      sweep.address,
      usdc.address,
      liquidityHelper.address,
      chainlink.usdc_usd,
      BORROWER
    );

    await sweep.addMinter(BORROWER, sweepAmount.mul(5));
    await sweep.addMinter(marketmaker.address, sweepAmount);

    // config market maker
    await marketmaker.configure(
      2000, Const.spreadFee, sweepAmount, Const.ZERO, Const.DAY, Const.RATIO,
      minAutoSweepAmount, Const.ZERO, Const.TRUE, Const.FALSE, Const.URL
    );
  });

  function pp(v, d) { return ethers.utils.formatUnits(v.toString(), d) }
  async function show(msg) {
    console.log("\n", msg)
    console.log("\n[SWEEP - PRICE]", pp(await sweep.ammPrice(), 6))
    console.log("[SWEEP - TARGET]", pp(await sweep.targetPrice(), 6))
    console.log("[SWEEP - Minting state]", await sweep.isMintingAllowed())
    console.log("\n[USDX] POOL", pp(await usdc.balanceOf(poolAddress), 6))
    console.log("[SWEEP] POOL", pp(await sweep.balanceOf(poolAddress), 18))
    console.log("\n[USDX] MM", pp(await usdc.balanceOf(marketmaker.address), 6))
    console.log("[SWEEP] MM", pp(await sweep.balanceOf(marketmaker.address), 18))
    console.log("[MM] assetValue", pp(await marketmaker.assetValue(), 6))
    console.log("\n[USDX] BRW", pp(await usdc.balanceOf(borrower.address), 6))
    console.log("[SWEEP] BRW", pp(await sweep.balanceOf(borrower.address), 18))
  }

  describe("main functions", async function () {
    it('create the pool and adds liquidity', async () => {
      const { token0, token1, sqrtPriceX96 } = getPriceAndData(sweep.address, usdc.address, 0, 0);
      expect(await factory.getPool(token0, token1, FEE)).to.equal(Const.ADDRESS_ZERO);
      expect(await marketmaker.assetValue()).to.equal(0);
      expect(await marketmaker.tradePosition()).to.equal(Const.ZERO);
      await positionManager.createAndInitializePoolIfNecessary(token0, token1, FEE, sqrtPriceX96)
      poolAddress = await factory.getPool(token0, token1, FEE);

      expect(poolAddress).to.not.equal(Const.ADDRESS_ZERO);
      pool = await ethers.getContractAt("IUniswapV3Pool", poolAddress);
      await(await pool.increaseObservationCardinalityNext(96)).wait();

      Uniswap = await ethers.getContractFactory("UniswapAMM");
      amm = await Uniswap.deploy(
        sweep.address,
        usdc.address,
        chainlink.sequencer,
        poolAddress,
        usdcOracle.address,
        86400,
        liquidityHelper.address
      );
      await sweep.setAMM(amm.address);

      usdxAmount = toBN("15000", 6);
      sweepAmount = toBN("15000", 18);

      await usdc.transfer(marketmaker.address, usdxAmount.mul(2));
      await marketmaker.lpTrade(usdxAmount, sweepAmount, 0, 0, 2000);

      expect(await usdc.balanceOf(poolAddress)).to.greaterThan(Const.ZERO);
      expect(await sweep.balanceOf(poolAddress)).to.greaterThan(Const.ZERO);
      expect(await marketmaker.assetValue()).to.greaterThan(Const.ZERO);
      expect(await marketmaker.tradePosition()).to.greaterThan(Const.ZERO);
    });

    it('adds liquidity', async () => {
      expect(await sweep.isMintingAllowed()).to.equal(Const.TRUE);
      tradeId = await marketmaker.tradePosition();

      usdcPoolBalance = await usdc.balanceOf(poolAddress);
      sweepPoolBalance = await sweep.balanceOf(poolAddress);

      await usdc.approve(marketmaker.address, usdxAmount);
      await marketmaker.lpTrade(usdxAmount, sweepAmount, 0, 0, 2000);

      expect(await usdc.balanceOf(poolAddress)).to.greaterThan(usdcPoolBalance);
      expect(await sweep.balanceOf(poolAddress)).to.greaterThan(sweepPoolBalance);
      expect(await marketmaker.tradePosition()).to.not.equal(tradeId);
    });

    it('changes the price by swaping and adding liquidity again', async () => {
      ammPrice = await sweep.ammPrice()
      usdcBefore = await usdc.balanceOf(marketmaker.address);
      sweepBefore = await sweep.balanceOf(marketmaker.address);

      usdxAmount = toBN("5000", 6);
      await marketmaker.buySweepOnAMM(usdxAmount, 10000)

      expect(await sweep.ammPrice()).to.greaterThan(ammPrice)
      expect(await usdc.balanceOf(marketmaker.address)).to.equal(usdcBefore.sub(usdxAmount))
      expect(await sweep.balanceOf(marketmaker.address)).to.greaterThan(sweepBefore)

      tradePosition = await marketmaker.tradePosition();
      sweepPoolBalance = await sweep.balanceOf(poolAddress);

      usdxAmount = toBN("22000", 6);
      sweepAmount = toBN("22000", 18);

      await usdc.approve(marketmaker.address, usdxAmount);
      await marketmaker.lpTrade(usdxAmount, sweepAmount, 0, 0, 2000);

      expect(await marketmaker.tradePosition()).to.not.equal(tradePosition);
    });

    it('changes the target price and replaces the Trade position', async () => {
      await sweep.setBalancer(balancer.address);
      await sweep.connect(balancer).setTargetPrice(1000500, 1000500);
      usdxAmount = toBN("15000", 6);
      sweepAmount = toBN("15000", 18);
      await usdc.approve(marketmaker.address, usdxAmount);
      await marketmaker.lpTrade(usdxAmount, sweepAmount, 0, 0, 2000);

      await sweep.connect(balancer).setTargetPrice(1001000, 1001000);
      usdxAmount = toBN("20000", 6);
      sweepAmount = toBN("20000", 18);
      await usdc.approve(marketmaker.address, usdxAmount);
      await marketmaker.lpTrade(usdxAmount, sweepAmount, 0, 0, 2000);
    })

    it('removes liquidity', async () => {
      usdcPoolBalance = await usdc.balanceOf(poolAddress);
      sweepPoolBalance = await sweep.balanceOf(poolAddress);

      position = await marketmaker.tradePosition();
      liquidity = await marketmaker.tradeLiquidity();
      liquidity = liquidity.div(3);

      await marketmaker.removeLiquidity(position, liquidity, 0, 0)

      expect(await usdc.balanceOf(poolAddress)).to.be.lessThan(usdcPoolBalance);
      expect(await sweep.balanceOf(poolAddress)).to.be.lessThan(sweepPoolBalance);
    });

    it('buys sweep from MM directly', async () => {
      expect(await sweep.balanceOf(borrower.address)).to.equal(0);
      usdcPoolBalance = await usdc.balanceOf(poolAddress);
      sweepPoolBalance = await sweep.balanceOf(poolAddress);
      await marketmaker.setSlippage(5e5);
      
      buyAmount = toBN("2000", 6);
      sweepToGet = toBN("1900", 18);

      await usdc.transfer(borrower.address, buyAmount)
      await usdc.connect(borrower).approve(marketmaker.address, buyAmount);
      await marketmaker.connect(borrower).buySweep(buyAmount);

      expect(await sweep.balanceOf(borrower.address)).to.greaterThan(sweepToGet);
      expect(await usdc.balanceOf(poolAddress)).to.greaterThan(usdcPoolBalance);
      expect(await sweep.balanceOf(poolAddress)).to.greaterThan(sweepPoolBalance);
    });

    it('adds single sided liquidty for USDx correctly', async () => {
      usdcPoolBalance = await usdc.balanceOf(poolAddress);
      assetValue = await marketmaker.assetValue();
      singleAmount0 = toBN("3000", 6);
      // await sweep.connect(balancer).setTargetPrice(1005000, 1005000);

      await show("--------------->")

      await usdc.approve(marketmaker.address, singleAmount0);
      await marketmaker.lpRedeem(singleAmount0, 1000);
      position = await marketmaker.redeemPosition();

      await show("--------------->")

      usdcBalance = await usdc.balanceOf(poolAddress);
      expect(usdcBalance).to.equal(usdcPoolBalance.add(singleAmount0));
      expect(position).to.greaterThan(0);

      singleAmount1 = toBN("4000", 6);

      await usdc.approve(marketmaker.address, singleAmount1);
      await marketmaker.lpRedeem(singleAmount1, TICK_SPREAD);

      expect(await usdc.balanceOf(poolAddress)).to.closeTo(usdcPoolBalance.add(singleAmount1), 1);
      expect(await marketmaker.assetValue()).to.greaterThan(assetValue);
      expect(await marketmaker.redeemPosition()).to.not.equal(position);
    });

    it.skip('slippage test', async () => {
      amount = toBN("2500", 6);
      await expect(marketmaker.buySweepOnAMM(amount, 200))
        .to.be.revertedWith('Too little received')

      expect(await marketmaker.getBuyPrice()).to.lessThan(await sweep.ammPrice());

      mmUBB = await usdc.balanceOf(marketmaker.address);
      mmSBB = await sweep.balanceOf(marketmaker.address);
      pUBB = await usdc.balanceOf(poolAddress);
      sUBB = await sweep.balanceOf(poolAddress);

      await marketmaker.buySweepOnAMM(amount, 1e4);

      expect(await usdc.balanceOf(marketmaker.address)).to.equal(mmUBB.sub(amount));
      expect(await sweep.balanceOf(marketmaker.address)).to.greaterThan(mmSBB);
      expect(await usdc.balanceOf(poolAddress)).to.greaterThan(pUBB);
      expect(await sweep.balanceOf(poolAddress)).to.lessThan(sUBB);
    })

    it.skip('adds single side liquidity for SWEEP correctly', async () => {
      singleAmount0 = toBN("1000", 18);
      amount = toBN("10000", 18);
      tickSpread = 750;

      await marketmaker.sellSweepOnAMM(amount, 2e5);
      assetValue = await marketmaker.assetValue();
      sweepPoolBalance = await sweep.balanceOf(poolAddress);

      expect(await sweep.ammPrice()).to.lessThan(await sweep.targetPrice());
      expect(await marketmaker.growPosition()).to.equal(0);
      await marketmaker.lpGrow(singleAmount0, tickSpread);

      sweepBalance = await sweep.balanceOf(poolAddress);
      expect(sweepBalance).to.greaterThan(sweepPoolBalance);
      growPosition = await marketmaker.growPosition();
      expect(growPosition).to.greaterThan(0);

      singleAmount1 = toBN("2000", 18);
      await marketmaker.lpGrow(singleAmount1, tickSpread);
      expect(await marketmaker.growPosition()).to.not.equal(growPosition);
    });

    it.skip('removes the grow position id', async () => {
      positionId = await marketmaker.growPosition();
      sweepBalance = await sweep.balanceOf(marketmaker.address);
      tickSpread = 1000;

      expect(positionId).to.not.equal(0);
      await marketmaker.burnGrowPosition();

      expect(await marketmaker.growPosition()).to.equal(0);
      expect(await sweep.balanceOf(marketmaker.address)).to.greaterThan(sweepBalance);

      singleAmount2 = toBN("2000", 18);
      await marketmaker.lpGrow(singleAmount2, tickSpread);
      expect(await marketmaker.growPosition()).to.greaterThan(0);
    })

    it.skip('removes redeem position correctly', async () => {
      marketBalance = await usdc.balanceOf(marketmaker.address)
      poolBalance = await usdc.balanceOf(poolAddress)

      await marketmaker.burnRedeemPosition();

      expect(await usdc.balanceOf(marketmaker.address)).to.closeTo(marketBalance.add(singleAmount1), 1);
      expect(await usdc.balanceOf(poolAddress)).to.closeTo(poolBalance.sub(singleAmount1), 1);
      expect(await marketmaker.redeemPosition()).to.equal(0);
    });
  })
});

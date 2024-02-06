const { expect } = require("chai");
const { ethers } = require("hardhat");
const { chainlink, uniswap } = require("../../utils/constants");
const { toBN, Const, getPriceAndData } = require("../../utils/helper_functions");

contract("Uniswap AMM", async function () {
  before(async () => {
    [owner] = await ethers.getSigners();
    OWNER = owner.address;
    USDC_AMOUNT = toBN("100", 6);
    SWEEP_AMOUNT = toBN("80", 18);

    USDC_MINT = 10000e6;
    SWEEP_MINT = toBN("10000", 18);
    USDC_INVEST = 20000e6;
    SWEEP_INVEST = toBN("20000", 18);
    usdxAmount = 1000e6;
    sweepAmount = toBN("1000", 18);
    FEE = 100;
    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [OWNER, OWNER, 2500]);
    sweep = await Proxy.deployed();

    ERC20 = await ethers.getContractFactory("USDCMock");
    usdt = await ERC20.deploy(6);
    usdc = await ERC20.deploy(6);

    LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
    liquidityHelper = await LiquidityHelper.deploy();

    factory = await ethers.getContractAt("IUniswapV3Factory", uniswap.factory);
    positionManager = await ethers.getContractAt("INonfungiblePositionManager", uniswap.positions_manager);

    Oracle = await ethers.getContractFactory("AggregatorMock");
    usdcOracle = await Oracle.deploy();

    MarketMaker = await ethers.getContractFactory("UniswapMarketMaker");
    marketmaker = await MarketMaker.deploy(
      'Uniswap Market Maker',
      sweep.address,
      usdc.address,
      chainlink.usdc_usd,
      OWNER
    );

    await sweep.addMinter(marketmaker.address, SWEEP_INVEST);
    // config stabilizer
    await marketmaker.configure(
      Const.RATIO,
      Const.spreadFee,
      SWEEP_INVEST,
      Const.ZERO,
      Const.DAY,
      Const.RATIO,
      SWEEP_INVEST,
      Const.ZERO,
      Const.FALSE,
      Const.FALSE,
      Const.URL
    );
  });

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
      await marketmaker.setAMM(amm.address);

      usdxAmount = toBN("15000", 6);
      sweepAmount = toBN("15000", 18);

      await usdc.transfer(marketmaker.address, usdxAmount.mul(2));
      await marketmaker.lpTrade(usdxAmount, sweepAmount, 5000, 30000, 7000);

      expect(await usdc.balanceOf(poolAddress)).to.greaterThan(Const.ZERO);
      expect(await sweep.balanceOf(poolAddress)).to.greaterThan(Const.ZERO);
      expect(await marketmaker.assetValue()).to.greaterThan(Const.ZERO);
      expect(await marketmaker.tradePosition()).to.greaterThan(Const.ZERO);
    });

    it("buys sweep correctly", async function () {
      sweepBefore = await sweep.balanceOf(OWNER);
      usdcBefore = await usdc.balanceOf(OWNER);

      await usdc.approve(amm.address, USDC_AMOUNT);
      await amm.buySweep(usdc.address, USDC_AMOUNT, USDC_AMOUNT.mul(99e10));

      sweepAfter = await sweep.balanceOf(OWNER);
      usdcAfter = await usdc.balanceOf(OWNER);

      expect(usdcAfter.add(USDC_AMOUNT)).to.be.equal(usdcBefore);
      expect(sweepAfter).to.be.above(sweepBefore);
    });

    it("sells sweep correctly", async function () {
      sweepBefore = await sweep.balanceOf(OWNER);
      usdcBefore = await usdc.balanceOf(OWNER);

      await sweep.approve(amm.address, SWEEP_AMOUNT);
      await amm.sellSweep(usdc.address, SWEEP_AMOUNT, SWEEP_AMOUNT.div(11e11));

      sweepAfter = await sweep.balanceOf(OWNER);
      usdcAfter = await usdc.balanceOf(OWNER);

      expect(sweepAfter.add(SWEEP_AMOUNT)).to.be.equal(sweepBefore);
      expect(usdcAfter).to.be.above(usdcBefore);
    });

    it.skip('buys Sweep from the MM', async () => {
      priceBefore = await amm.getPrice();
      sweepBalanceB = await sweep.balanceOf(poolAddress);
      usdcBalanceB = await usdc.balanceOf(poolAddress);
      await marketmaker.setSlippage(3e5);
      
      expect(await marketmaker.getBuyPrice()).to.greaterThan(priceBefore);

      USDC_AMOUNT = toBN("2000", 6);
      MIN_AMOUNT_OUT = toBN("1900", 18);
      await usdc.approve(amm.address, USDC_AMOUNT);
      await amm.buySweep(usdc.address, USDC_AMOUNT, MIN_AMOUNT_OUT);

      priceAfter = await amm.getPrice();

      expect(priceAfter).to.greaterThan(priceBefore);
      expect(await marketmaker.getBuyPrice()).to.lessThan(priceAfter);
      expect(await sweep.balanceOf(poolAddress)).to.lessThan(sweepBalanceB);
      expect(await usdc.balanceOf(poolAddress)).to.equal(usdcBalanceB.add(USDC_AMOUNT));

      sweepBalanceB = await sweep.balanceOf(poolAddress);
      usdcBalanceB = await usdc.balanceOf(poolAddress);

      await usdc.approve(amm.address, USDC_AMOUNT);
      await amm.buySweep(usdc.address, USDC_AMOUNT, MIN_AMOUNT_OUT);

      expect(await sweep.balanceOf(poolAddress)).to.lessThan(sweepBalanceB)
      expect(await usdc.balanceOf(poolAddress)).to.greaterThan(usdcBalanceB)
    });
  });
});

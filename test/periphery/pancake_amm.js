const { expect } = require("chai");
const { ethers } = require("hardhat");
const { chainlink, pancake } = require("../../utils/constants");
const { toBN, Const, getPriceAndData } = require("../../utils/helper_functions");

contract("Pancake AMM", async function () {
  before(async () => {
    [owner] = await ethers.getSigners();
    OWNER = owner.address;
    USDC_AMOUNT = toBN("100", 18);
    SWEEP_AMOUNT = toBN("80", 18);

    USDC_MINT = toBN("10000", 18);
    SWEEP_MINT = toBN("10000", 18);
    USDC_INVEST = toBN("20000", 18);
    SWEEP_INVEST = toBN("20000", 18);
    usdxAmount = toBN("1000", 18);
    sweepAmount = toBN("1000", 18);
    FEE = 100;
    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [OWNER, OWNER, 2500]);
    sweep = await Proxy.deployed();

    ERC20 = await ethers.getContractFactory("USDCMock");
    usdt = await ERC20.deploy(18);
    usdc = await ERC20.deploy(18);

    LiquidityHelper = await ethers.getContractFactory("PancakeLiquidityHelper");
    liquidityHelper = await LiquidityHelper.deploy(pancake.positions_manager);

    factory = await ethers.getContractAt("IUniswapV3Factory", pancake.factory);
    positionManager = await ethers.getContractAt("INonfungiblePositionManager", pancake.positions_manager);

    Oracle = await ethers.getContractFactory("AggregatorMock");
    usdcOracle = await Oracle.deploy();

    MarketMaker = await ethers.getContractFactory("PancakeMarketMaker");
    marketmaker = await MarketMaker.deploy(
      'Pancake Market Maker',
      sweep.address,
      usdc.address,
      chainlink.usdc_usd,
      pancake.positions_manager,
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
      const { token0, token1 } = getPriceAndData(sweep.address, usdc.address, 0, 0);
      expect(await factory.getPool(token0, token1, FEE)).to.equal(Const.ADDRESS_ZERO);
      expect(await marketmaker.assetValue()).to.equal(0);
      expect(await marketmaker.tradePosition()).to.equal(0);
      price = toBN("79267766696949822870343647232", 0)
      await positionManager.createAndInitializePoolIfNecessary(token0, token1, FEE, price)
      pool_address = await factory.getPool(token0, token1, FEE);

      expect(pool_address).to.not.equal(Const.ADDRESS_ZERO);
      pool = await ethers.getContractAt("IPancakePool", pool_address);
      await(await pool.increaseObservationCardinalityNext(96)).wait();

      Pancake = await ethers.getContractFactory("PancakeAMM");
      amm = await Pancake.deploy(
        sweep.address,
        usdc.address,
        chainlink.sequencer,
        pool_address,
        usdcOracle.address,
        86400,
        liquidityHelper.address,
        pancake.router
      );
      await sweep.setAMM(amm.address);
      await marketmaker.setAMM(amm.address);

      usdxAmount = toBN("15000", 18);
      sweepAmount = toBN("15000", 18);

      await usdc.transfer(marketmaker.address, usdxAmount.mul(2));
      await marketmaker.borrow(sweepAmount);
      await marketmaker.lpTrade(usdxAmount, sweepAmount, 1e5, 1e5, 3e4);

      expect(await usdc.balanceOf(pool_address)).to.greaterThan(Const.ZERO);
      expect(await sweep.balanceOf(pool_address)).to.greaterThan(Const.ZERO);
      expect(await marketmaker.assetValue()).to.greaterThan(Const.ZERO);
      expect(await marketmaker.tradePosition()).to.greaterThan(Const.ZERO);
    });

    it("buys sweep correctly", async function () {
      sweepBefore = await sweep.balanceOf(OWNER);
      usdcBefore = await usdc.balanceOf(OWNER);

      await usdc.approve(amm.address, USDC_AMOUNT);
      await amm.buySweep(usdc.address, USDC_AMOUNT, SWEEP_AMOUNT);

      sweepAfter = await sweep.balanceOf(OWNER);
      usdcAfter = await usdc.balanceOf(OWNER);

      expect(usdcAfter.add(USDC_AMOUNT)).to.be.equal(usdcBefore);
      expect(sweepAfter).to.be.above(sweepBefore);
    });

    it("sells sweep correctly", async function () {
      sweepBefore = await sweep.balanceOf(OWNER);
      usdcBefore = await usdc.balanceOf(OWNER);

      SWEEP_AMOUNT = toBN("1000", 18);
      MIN_AMOUNT = toBN("900", 18)
      await sweep.approve(amm.address, SWEEP_AMOUNT);
      await amm.sellSweep(usdc.address, SWEEP_AMOUNT, MIN_AMOUNT);

      sweepAfter = await sweep.balanceOf(OWNER);
      usdcAfter = await usdc.balanceOf(OWNER);

      expect(sweepAfter.add(SWEEP_AMOUNT)).to.be.equal(sweepBefore);
      expect(usdcAfter).to.be.above(usdcBefore);
    });

    it('buys Sweep from the MM', async () => {
      priceBefore = await amm.getPrice();
      sweepBalanceB = await sweep.balanceOf(pool_address);
      usdcBalanceB = await usdc.balanceOf(pool_address);
      
      expect(await marketmaker.getBuyPrice())
        .to.greaterThan(priceBefore);

      USDC_AMOUNT = toBN("1100", 18);
      MIN_AMOUNT_OUT = toBN("1000", 18);
      await usdc.approve(amm.address, USDC_AMOUNT);
      await amm.buySweep(usdc.address, USDC_AMOUNT, MIN_AMOUNT_OUT);

      await usdc.approve(amm.address, USDC_AMOUNT);
      await amm.buySweep(usdc.address, USDC_AMOUNT, MIN_AMOUNT_OUT);

      priceAfter = await amm.getPrice();

      expect(priceAfter).to.greaterThan(priceBefore);
      expect(await marketmaker.getBuyPrice()).to.lessThan(priceAfter);
      expect(await sweep.balanceOf(pool_address)).to.lessThan(sweepBalanceB);
      expect(await usdc.balanceOf(pool_address)).to.greaterThan(usdcBalanceB);

      sweepBalanceB = await sweep.balanceOf(pool_address);
      usdcBalanceB = await usdc.balanceOf(pool_address);

      await usdc.approve(amm.address, USDC_AMOUNT);
      await amm.buySweep(usdc.address, USDC_AMOUNT, MIN_AMOUNT_OUT);

      expect(await sweep.balanceOf(pool_address)).to.lessThan(sweepBalanceB)
      expect(await usdc.balanceOf(pool_address)).to.greaterThan(usdcBalanceB)
    });
  });
});

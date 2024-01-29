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
    usdc = await ERC20.deploy(18);

    LiquidityHelper = await ethers.getContractFactory("PancakeLiquidityHelper");
    liquidityHelper = await LiquidityHelper.deploy();

    factory = await ethers.getContractAt("IUniswapV3Factory", pancake.factory);
    positionManager = await ethers.getContractAt("INonfungiblePositionManager", pancake.positions_manager);

    Oracle = await ethers.getContractFactory("AggregatorMock");
    usdcOracle = await Oracle.deploy();

    MarketMaker = await ethers.getContractFactory("PancakeMarketMaker");
    marketmaker = await MarketMaker.deploy(
      'Pancake Market Maker',
      sweep.address,
      usdc.address,
      liquidityHelper.address,
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
    it("initial setup - create and add liquitiy", async function () {
      const { token0, token1 } = getPriceAndData(sweep.address, usdc.address, 0, 0);
      expect(await factory.getPool(token0, token1, FEE)).to.equal(Const.ADDRESS_ZERO);
      expect(await marketmaker.assetValue()).to.equal(0);
      price = toBN("79228162514264337593543950336", 0)
      await positionManager.createAndInitializePoolIfNecessary(token0, token1, FEE, price)
      pool_address = await factory.getPool(token0, token1, FEE);

      expect(pool_address).to.not.equal(Const.ADDRESS_ZERO);
      pool = await ethers.getContractAt("IPancakePool", pool_address);
      await(await pool.increaseObservationCardinalityNext(96)).wait();

      PancakeAMM = await ethers.getContractFactory("PancakeAMM");
      amm = await PancakeAMM.deploy(
        sweep.address,
        usdc.address,
        chainlink.sequencer,
        usdcOracle.address,
        86400,
        liquidityHelper.address
      );

      await sweep.setAMM(amm.address);
      await amm.setMarketMaker(marketmaker.address);
      await usdc.approve(marketmaker.address, USDC_INVEST);
      await marketmaker.initPool(USDC_INVEST, SWEEP_MINT, 0, 0, pool_address);
      await amm.setPool(pool_address);

      expect(await sweep.balanceOf(pool_address)).to.greaterThan(0);
      expect(await usdc.balanceOf(pool_address)).to.greaterThan(0);
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

      await sweep.approve(amm.address, SWEEP_AMOUNT);
      MIN_AMOUNT = toBN("70", 18)
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
      await marketmaker.setSlippage(5e5);
      
      expect(await marketmaker.getBuyPrice()).to.greaterThan(priceBefore);

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

      expect(await sweep.balanceOf(pool_address)).to.greaterThan(sweepBalanceB)
      expect(await usdc.balanceOf(pool_address)).to.greaterThan(usdcBalanceB)
    });
  });
});

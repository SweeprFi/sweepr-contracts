const { expect } = require("chai");
const { ethers } = require("hardhat");
const { chainlink, uniswap } = require("../../utils/constants");
const { toBN, Const, increaseTime, getPriceAndData } = require("../../utils/helper_functions");

contract("Uniswap AMM", async function () {
  before(async () => {
    [owner] = await ethers.getSigners();
    OWNER = owner.address;
    USDC_AMOUNT = 100e6;
    SWEEP_AMOUNT = toBN("80", 18);

    USDC_MINT = 10000e6;
    SWEEP_MINT = toBN("10000", 18);
    USDC_INVEST = 20000e6;
    SWEEP_INVEST = toBN("20000", 18);
    usdxAmount = 1000e6;
    sweepAmount = toBN("1000", 18);
    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [OWNER, OWNER, 2500]);
    sweep = await Proxy.deployed();

    ERC20 = await ethers.getContractFactory("USDCMock");
    usdc = await ERC20.deploy();

    LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
    liquidityHelper = await LiquidityHelper.deploy();

    factory = await ethers.getContractAt("IUniswapV3Factory", uniswap.factory);
    positionManager = await ethers.getContractAt("INonfungiblePositionManager", uniswap.positions_manager);

    UniV3Asset = await ethers.getContractFactory("UniV3Asset");
    asset = await UniV3Asset.deploy(
      'Uniswap Asset',
      sweep.address,
      usdc.address,
      liquidityHelper.address,
      chainlink.usdc_usd,
      OWNER
    );

    Oracle = await ethers.getContractFactory("AggregatorMock");
    usdcOracle = await Oracle.deploy();

    await sweep.addMinter(asset.address, SWEEP_INVEST);
    // config stabilizer
    await asset.configure(
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
      const { token0, token1, sqrtPriceX96 } =
        getPriceAndData(sweep.address, usdc.address, sweepAmount, usdxAmount);

      await positionManager.createAndInitializePoolIfNecessary(token0, token1, 500, sqrtPriceX96)
      pool_address = await factory.getPool(token0, token1, 500);

      pool = await ethers.getContractAt("IUniswapV3Pool", pool_address);
      await (await pool.increaseObservationCardinalityNext(96)).wait();

      UniswapAMM = await ethers.getContractFactory("UniswapAMM");
      amm = await UniswapAMM.deploy(
        sweep.address,
        usdc.address,
        chainlink.sequencer,
        pool_address,
        usdcOracle.address,
        86400,
        liquidityHelper.address
      );
      await sweep.setAMM(amm.address);
      await usdc.transfer(asset.address, USDC_MINT);
      await asset.borrow(SWEEP_MINT);
      await asset.invest(USDC_INVEST, SWEEP_MINT, 0, 0);
    });

    it("buys sweep correctly", async function () {
      sweepBefore = await sweep.balanceOf(OWNER);
      usdcBefore = await usdc.balanceOf(OWNER);

      await usdc.approve(amm.address, USDC_AMOUNT);
      await amm.buySweep(usdc.address, USDC_AMOUNT, Const.ZERO);

      sweepAfter = await sweep.balanceOf(OWNER);
      usdcAfter = await usdc.balanceOf(OWNER);

      expect(usdcAfter.add(USDC_AMOUNT)).to.be.equal(usdcBefore);
      expect(sweepAfter).to.be.above(sweepBefore);
    });

    it("sells sweep correctly", async function () {
      sweepBefore = await sweep.balanceOf(OWNER);
      usdcBefore = await usdc.balanceOf(OWNER);

      await sweep.approve(amm.address, SWEEP_AMOUNT);
      await amm.sellSweep(usdc.address, SWEEP_AMOUNT, Const.ZERO);

      sweepAfter = await sweep.balanceOf(OWNER);
      usdcAfter = await usdc.balanceOf(OWNER);

      expect(sweepAfter.add(SWEEP_AMOUNT)).to.be.equal(sweepBefore);
      expect(usdcAfter).to.be.above(usdcBefore);
    });

    it('fetches the Sweep price correctly', async () => {
      await increaseTime(86400); // 1 day
      price = await amm.getPrice();
      twaPrice = await amm.getTWAPrice();
      expect(price).to.eq(twaPrice);
    });
  });
});

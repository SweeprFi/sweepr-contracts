const { expect } = require("chai");
const { ethers } = require("hardhat");
const { chainlink, curve } = require('../../utils/constants');
const { Const, toBN } = require("../../utils/helper_functions");
let poolAddress;

contract('Curve Market Maker', async () => {
  before(async () => {
    [borrower, lzEndpoint, multisig, treasury] = await ethers.getSigners();
    BORROWER = borrower.address;

    sweepAmount = toBN("100000000000000", 18);
    usdcAmount = toBN("10000", 6);
    buyAmount = toBN("3000", 18);

    Sweep = await ethers.getContractFactory("SweepCoin");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, multisig.address, 2500]);
    sweep = await Proxy.deployed();

    await sweep.setTreasury(treasury.address);
    ERC20 = await ethers.getContractFactory("USDCMock");
    usdc = await ERC20.deploy(6);
    factory = await ethers.getContractAt("ICurvePoolFactory", curve.factory);

    Oracle = await ethers.getContractFactory("AggregatorMock");
    usdcOracle = await Oracle.deploy();

    AMM = await ethers.getContractFactory("CurveAMM");
    amm = await AMM.deploy(sweep.address, usdc.address, chainlink.sequencer, usdcOracle.address, 86400);

    RatesOracle = await ethers.getContractFactory("RatesOracle");
    ratesOracle = await RatesOracle.deploy(sweep.address);

    await sweep.setAMM(amm.address);

    await( await factory.deploy_plain_pool(
      "SWEEP-USDC StablePool",
      "SWEEP-USDC",
      [usdc.address, sweep.address],
      100,
      1e6,
      10000000000,
      865,
      0,
      [0,1],
      ["0x00000000", "0x2e3d20a1"],
      ['0x0000000000000000000000000000000000000000', ratesOracle.address],
    )).wait();

    poolAddress = await factory.find_pool_for_coins(usdc.address, sweep.address)
    curvePool = await ethers.getContractAt("ICurvePool", poolAddress);
  });

  it('deploy and configure the Curve MM', async () => {
    MarketMaker = await ethers.getContractFactory("CurveMarketMaker");
    marketmaker = await MarketMaker.deploy('Curve Market Maker', sweep.address, usdc.address, usdcOracle.address, poolAddress, BORROWER);

    await marketmaker.configure(0, 0, sweepAmount, 0, 0, 0, 0, 0, false, false, Const.URL)
    await sweep.addMinter(marketmaker.address, sweepAmount);
    await amm.setMarketMaker(marketmaker.address);

    await usdc.transfer(marketmaker.address, toBN("15", 6));
    await marketmaker.borrow(toBN("5", 18));
    await marketmaker.addLiquidity(toBN("5", 6), toBN("5", 18));
  });

  it('Adds Liquidity correctly', async () => {
    await usdc.transfer(marketmaker.address, 2e6);
    await amm.setPool(poolAddress);

    usdcToAdd = toBN("2000", 6);
    sweepToAdd = toBN("1000", 18);

    sweepBefore = await sweep.balanceOf(poolAddress);
    usdcBefore = await usdc.balanceOf(poolAddress);

    await usdc.transfer(marketmaker.address, usdcToAdd);
    await marketmaker.borrow(sweepToAdd);
    await marketmaker.addLiquidity(usdcToAdd, sweepToAdd);

    expect(await usdc.balanceOf(poolAddress)).to.equal(usdcBefore.add(usdcToAdd));
    expect(await sweep.balanceOf(poolAddress)).to.equal(sweepBefore.add(sweepToAdd));
  });

  it('Removes liquidity correctly', async () => {
    lpToBurn = toBN("500", 18);
    minimums = [toBN("150", 6), toBN("150", 18)];

    price = await sweep.ammPrice();
    lpTokensBefore = await curvePool.balanceOf(marketmaker.address);
    await marketmaker.removeLiquidity(lpToBurn, minimums);
    expect(await curvePool.balanceOf(marketmaker.address)).to.equal(lpTokensBefore.sub(lpToBurn));
  });

  it('Increases liquidity by buying Sweep', async () => {
    usdxAmount = toBN("500", 6);
    sweepToGet = toBN("498", 18);
    sweepBefore = await sweep.balanceOf(borrower.address);
    usdcBefore = await usdc.balanceOf(borrower.address);
    poolSweepBefore = await usdc.balanceOf(poolAddress);
    poolUsdcBefore = await usdc.balanceOf(poolAddress);

    await usdc.approve(marketmaker.address, usdxAmount);
    await marketmaker.buySweep(usdxAmount);

    expect(await usdc.balanceOf(borrower.address)).to.equal(usdcBefore.sub(usdxAmount));
    expect(await sweep.balanceOf(borrower.address)).to.be.greaterThan(sweepToGet);

    expect(await sweep.balanceOf(poolAddress)).to.greaterThan(poolSweepBefore);
    expect(await usdc.balanceOf(poolAddress)).to.greaterThan(poolUsdcBefore);
  });

  it('buys Sweep from the MM', async () => {
    price = await amm.getPrice();
    expect(await marketmaker.getBuyPrice()).to.be.lessThan(price);

    sweepBalance = await sweep.balanceOf(poolAddress);
    usdcBalance = await usdc.balanceOf(poolAddress);

    USDC_AMOUNT = toBN("950", 6);
    MIN_AMOUNT = toBN("850", 18);

    await usdc.approve(amm.address, USDC_AMOUNT);
    await amm.buySweep(usdc.address, USDC_AMOUNT, MIN_AMOUNT);

    expect(await sweep.balanceOf(poolAddress)).to.greaterThan(sweepBalance)
    expect(await usdc.balanceOf(poolAddress)).to.greaterThan(usdcBalance)
  });

  it('Removes single sided liquidity correctly USDC', async () => {
    burnAmont = toBN("50", 18);
    index = 0;
    minAmountOut = toBN("40", 6);

    lpBefore = await curvePool.balanceOf(marketmaker.address);
    usdcBefore = await usdc.balanceOf(marketmaker.address);
    await marketmaker.removeSingleSidedLiquidity(lpToBurn, index, minAmountOut);
    lpAfter = await curvePool.balanceOf(marketmaker.address);
    usdcAfter = await usdc.balanceOf(marketmaker.address);

    expect(lpBefore).to.be.greaterThan(lpAfter);
    expect(usdcBefore).to.be.lessThan(usdcAfter);
  });

  it('Removes single sided liquidity correctly SWEEP', async () => {
    burnAmont = toBN("50", 18);
    index = 1;
    minAmountOut = toBN("40", 18);

    lpBefore = await curvePool.balanceOf(marketmaker.address);
    usdcBefore = await sweep.balanceOf(marketmaker.address);
    await marketmaker.removeSingleSidedLiquidity(lpToBurn, index, minAmountOut);
    lpAfter = await curvePool.balanceOf(marketmaker.address);
    usdcAfter = await sweep.balanceOf(marketmaker.address);

    expect(lpBefore).to.be.greaterThan(lpAfter);
    expect(usdcBefore).to.be.lessThan(usdcAfter);
  });

  describe("Curve AMM", async function () {
    before(async () => {
      OWNER = borrower.address;
      USDC_AMOUNT = 100e6;
      SWEEP_AMOUNT = toBN("98", 18);

      await amm.setMarketMaker(ethers.constants.AddressZero);
    });

    describe("Buy Sweep", async function () {
      it("fails with bad rates", async function () {
        sweepBefore = await sweep.balanceOf(OWNER);
        usdcBefore = await usdc.balanceOf(OWNER);
  
        await usdc.approve(amm.address, USDC_AMOUNT);

        await expect(amm.buySweep(usdc.address, USDC_AMOUNT, toBN("20", 18)))
            .to.be.revertedWithCustomError(amm, "BadRate");
      });
      
      it("buys correctly", async function () {
        sweepBefore = await sweep.balanceOf(OWNER);
        usdcBefore = await usdc.balanceOf(OWNER);
  
        await usdc.approve(amm.address, USDC_AMOUNT);
        await amm.buySweep(usdc.address, USDC_AMOUNT, SWEEP_AMOUNT);
  
        sweepAfter = await sweep.balanceOf(OWNER);
        usdcAfter = await usdc.balanceOf(OWNER);
  
        expect(usdcAfter.add(USDC_AMOUNT)).to.be.equal(usdcBefore);
        expect(sweepAfter).to.be.above(sweepBefore);
      });
    });
  
    describe("Sell Sweep", async function () {
      it("fails with bad rates", async function () {
        sweepBefore = await sweep.balanceOf(OWNER);
        usdcBefore = await usdc.balanceOf(OWNER);
  
        await sweep.approve(amm.address, SWEEP_AMOUNT);
  
        await expect(amm.sellSweep(usdc.address, SWEEP_AMOUNT, 20e6))
          .to.be.revertedWithCustomError(amm, "BadRate");
      });
      
      it("sells correctly", async function () {
        sweepBefore = await sweep.balanceOf(OWNER);
        usdcBefore = await usdc.balanceOf(OWNER);
  
        await sweep.approve(amm.address, SWEEP_AMOUNT);
        await amm.sellSweep(usdc.address, SWEEP_AMOUNT, 85e6);
  
        sweepAfter = await sweep.balanceOf(OWNER);
        usdcAfter = await usdc.balanceOf(OWNER);
  
        expect(sweepAfter.add(SWEEP_AMOUNT)).to.be.equal(sweepBefore);
        expect(usdcAfter).to.be.above(usdcBefore);
      });
    });
  });
});

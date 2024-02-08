const { expect } = require("chai");
const { ethers } = require("hardhat");
const { tokens, wallets, chainlink, curve, deployments } = require('../../utils/constants');
const { Const, impersonate, toBN, sendEth } = require("../../utils/helper_functions");
let poolAddress;

contract('Curve Market Maker', async () => {
  before(async () => {
    [borrower] = await ethers.getSigners();

    USDC_ADDRESS = tokens.usdc;
    SWEEP_ADDRESS = tokens.sweep;
    HOLDER = wallets.usdc_holder;
    BORROWER = borrower.address;
    USDC_ORACLE = chainlink.usdc_usd;

    sweepAmount = toBN("100000000000000", 18);
    usdcAmount = toBN("10000", 6);
    buyAmount = toBN("3000", 18);

    sweep = await ethers.getContractAt("SweepCoin", SWEEP_ADDRESS);
    usdc = await ethers.getContractAt("ERC20", USDC_ADDRESS);
    factory = await ethers.getContractAt("ICurvePoolFactory", curve.factory);

    Oracle = await ethers.getContractFactory("AggregatorMock");
    usdcOracle = await Oracle.deploy();

    AMM = await ethers.getContractFactory("CurveAMM");
    amm = await AMM.deploy(SWEEP_ADDRESS, USDC_ADDRESS, chainlink.sequencer, usdcOracle.address, 86400);

    RatesOracle = await ethers.getContractFactory("RatesOracle");
    ratesOracle = await RatesOracle.deploy(SWEEP_ADDRESS);

    await sendEth(HOLDER);
    usdcHolder = await impersonate(HOLDER);
    await usdc.connect(usdcHolder).transfer(borrower.address, usdcAmount.mul(2));

    SWEEP_OWNER = await sweep.owner();
    await sendEth(SWEEP_OWNER);
    sweepOwner = await impersonate(SWEEP_OWNER);
    await sweep.connect(sweepOwner).setAMM(amm.address);

    poolAddress = deployments.curve_pool;
    curvePool = await ethers.getContractAt("ICurvePool", poolAddress);
  });

  it('deploy and configure the Curve MM', async () => {
    MarketMaker = await ethers.getContractFactory("CurveMarketMaker");
    marketmaker = await MarketMaker.deploy('Curve Market Maker', sweep.address, USDC_ADDRESS, USDC_ORACLE, poolAddress, BORROWER);

    await marketmaker.configure(0, 0, sweepAmount, 0, 0, 0, 0, 0, false, false, Const.URL)
    await sweep.connect(sweepOwner).addMinter(marketmaker.address, sweepAmount);
    await amm.connect(sweepOwner).setMarketMaker(marketmaker.address);

    SWEEP_HOLDER = "0xc7b145ad8f3ad68587efca54024f342de825ad9d";
    await sendEth(SWEEP_HOLDER);
    user = await impersonate(SWEEP_HOLDER);
    await sweep.connect(user).transfer(marketmaker.address, toBN("5", 18));
    await usdc.connect(usdcHolder).transfer(marketmaker.address, toBN("5", 6));
    await marketmaker.addLiquidity(toBN("5", 6), toBN("5", 18));
  });

  it('Adds Liquidity correctly', async () => {
    await usdc.connect(sweepOwner).transfer(marketmaker.address, 2e6);
    await amm.connect(sweepOwner).setPool(poolAddress);
    // ----- Set isMintingAllowed: true
    BALANCER = await sweep.balancer();
    await sendEth(BALANCER);
    balancerImpersonation = await impersonate(BALANCER);
    await sweep.connect(balancerImpersonation).setTargetPrice(9e5, 9e5);

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
    balancerImpersonation = await impersonate(BALANCER);
    await sweep.connect(balancerImpersonation).setTargetPrice(1e6, 1e6);

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
    balancerImpersonation = await impersonate(BALANCER);
    await sweep.connect(balancerImpersonation).setTargetPrice(9e5, 9e5);

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

  describe("Curve AMM", async function () {
    before(async () => {
      OWNER = borrower.address;
      USDC_AMOUNT = 100e6;
      SWEEP_AMOUNT = toBN("98", 18);

      await usdc.connect(usdcHolder).transfer(OWNER, USDC_AMOUNT);
      await amm.connect(sweepOwner).setMarketMaker(ethers.constants.AddressZero);
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
});

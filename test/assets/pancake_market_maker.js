const { expect } = require("chai");
const { ethers } = require("hardhat");
const { chainlink, pancake } = require("../../utils/constants");
const { Const, getPriceAndData, toBN } = require("../../utils/helper_functions");
let poolAddress;

contract.skip('Pancake Market Maker', async () => {
  before(async () => {
    [owner, borrower, treasury, guest, lzEndpoint, multisig, balancer] = await ethers.getSigners();
  
    usdxAmount = toBN("10000000", 18); // 10M
    sweepAmount = toBN("10000000", 18); // 10M
    minAutoSweepAmount = toBN("100", 18);
    BORROWER = owner.address;
    FEE = 100;
    TICK_SPREAD = 1000;

    // SWEEP = token0
    ERC20 = await ethers.getContractFactory("USDCMock");
    usdc = await ERC20.deploy(18);

    Sweep = await ethers.getContractFactory("SweepCoin");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, multisig.address, 2500]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);
    // SWEEP = token1
    // ERC20 = await ethers.getContractFactory("USDCMock");
    // usdc = await ERC20.deploy(18);

    LiquidityHelper = await ethers.getContractFactory("PancakeLiquidityHelper");
    liquidityHelper = await LiquidityHelper.deploy(pancake.positions_manager);

    Oracle = await ethers.getContractFactory("AggregatorMock");
    usdcOracle = await Oracle.deploy();
    await usdcOracle.setPrice(Const.USDC_PRICE);

    positionManager = await ethers.getContractAt("INonfungiblePositionManager", pancake.positions_manager);
    factory = await ethers.getContractAt("IUniswapV3Factory", pancake.factory);
    swapRouter = await ethers.getContractAt("ISwapRouter", pancake.router);

    MarketMaker = await ethers.getContractFactory("PancakeMarketMaker");
    marketmaker = await MarketMaker.deploy(
      'Pancake Market Maker',
      sweep.address,
      usdc.address,
      chainlink.usdc_usd,
      pancake.positions_manager,
      BORROWER
    );

    await sweep.addMinter(BORROWER, sweepAmount.mul(5));
    await sweep.addMinter(marketmaker.address, sweepAmount);

    // config market maker
    await marketmaker.configure(
      3e5, Const.spreadFee, sweepAmount, Const.ZERO, Const.DAY, Const.RATIO,
      minAutoSweepAmount, Const.ZERO, Const.TRUE, Const.FALSE, Const.URL
    );

    console.log("USDTM ADDRESS:", usdc.address);
    console.log("SWEEP ADDRESS:", sweep.address);
  });

  describe("main functions", async function () {
    it('create the pool and adds liquidity', async () => {
      const { token0, token1 } = getPriceAndData(sweep.address, usdc.address, 0, 0);
      expect(await factory.getPool(token0, token1, FEE)).to.equal(Const.ADDRESS_ZERO);
      expect(await marketmaker.assetValue()).to.equal(0);
      expect(await marketmaker.tradePosition()).to.equal(0);
      price = toBN("79623317895830908422001262592", 0) // SWEEP = token0
      // price = toBN("78831026366734653132768280576", 0) // SWEEP = token1
      await positionManager.createAndInitializePoolIfNecessary(token0, token1, FEE, price)
      poolAddress = await factory.getPool(token0, token1, FEE);

      expect(poolAddress).to.not.equal(Const.ADDRESS_ZERO);
      pool = await ethers.getContractAt("IPancakePool", poolAddress);
      await(await pool.increaseObservationCardinalityNext(96)).wait();

      Pancake = await ethers.getContractFactory("PancakeAMM");
      amm = await Pancake.deploy(
        sweep.address,
        usdc.address,
        chainlink.sequencer,
        poolAddress,
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
      await marketmaker.lpTrade(usdxAmount, sweepAmount, 3e5, 3e5, 2e5);

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

      await usdc.transfer(marketmaker.address, usdxAmount);
      await marketmaker.borrow(sweepAmount);
      await marketmaker.lpTrade(usdxAmount, sweepAmount, 3e5, 3e5, 2e5);

      expect(await usdc.balanceOf(poolAddress)).to.greaterThan(usdcPoolBalance);
      expect(await sweep.balanceOf(poolAddress)).to.greaterThan(sweepPoolBalance);
      expect(await marketmaker.tradePosition()).to.not.equal(tradeId);
    });

    it('changes the price by swaping and adding liquidity again', async () => {
      ammPrice = await sweep.ammPrice()
      usdcBefore = await usdc.balanceOf(marketmaker.address);
      sweepBefore = await sweep.balanceOf(marketmaker.address);

      usdxAmount = toBN("5000", 18);
      await marketmaker.buySweepOnAMM(usdxAmount, 200000)

      expect(await sweep.ammPrice()).to.greaterThan(ammPrice)
      expect(await usdc.balanceOf(marketmaker.address)).to.equal(usdcBefore.sub(usdxAmount))
      expect(await sweep.balanceOf(marketmaker.address)).to.greaterThan(sweepBefore)

      tradePosition = await marketmaker.tradePosition();
      sweepPoolBalance = await sweep.balanceOf(poolAddress);

      usdxAmount = toBN("22000", 18);
      sweepAmount = toBN("22000", 18);

      await usdc.transfer(marketmaker.address, usdxAmount);
      await marketmaker.borrow(sweepAmount);
      await marketmaker.lpTrade(usdxAmount, sweepAmount, 9e5, 9e5, 2e5);

      expect(await marketmaker.tradePosition()).to.not.equal(tradePosition);
    });

    it('changes the target price and replaces the Trade position', async () => {
      await sweep.setBalancer(balancer.address);
      await sweep.connect(balancer).setTargetPrice(1000500, 1000500);
      usdxAmount = toBN("15000", 18);
      sweepAmount = toBN("15000", 18);
      await usdc.approve(marketmaker.address, usdxAmount);
      await marketmaker.lpTrade(usdxAmount, sweepAmount, 9e5, 9e5, 3e5);

      await sweep.connect(balancer).setTargetPrice(1001000, 1001000);
      usdxAmount = toBN("20000", 18);
      sweepAmount = toBN("20000", 18);
      await usdc.approve(marketmaker.address, usdxAmount);
      await marketmaker.lpTrade(usdxAmount, sweepAmount, 9e5, 9e5, 3e5);
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
      await marketmaker.setSlippage(6e5);
      
      buyAmount = toBN("2000", 18);
      sweepToGet = toBN("600", 18);

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
      usdcSingleAmount0 = toBN("3000", 18);

      await usdc.approve(marketmaker.address, usdcSingleAmount0);
      await marketmaker.lpRedeem(usdcSingleAmount0, 1000, 5000);
      position = await marketmaker.redeemPosition();

      usdcBalance = await usdc.balanceOf(poolAddress);
      expect(usdcBalance).to.equal(usdcPoolBalance.add(usdcSingleAmount0));
      expect(position).to.greaterThan(0);

      usdcSingleAmount1 = toBN("4000", 18);

      await usdc.approve(marketmaker.address, usdcSingleAmount1);
      await marketmaker.lpRedeem(usdcSingleAmount1, TICK_SPREAD, 5000);

      expect(await usdc.balanceOf(poolAddress)).to.closeTo(usdcPoolBalance.add(usdcSingleAmount1), 1);
      expect(await marketmaker.assetValue()).to.greaterThan(assetValue);
      expect(await marketmaker.redeemPosition()).to.not.equal(position);
    });

    it('slippage test', async () => {
      amount = toBN("2500", 18);
      await expect(marketmaker.buySweepOnAMM(amount, 200))
        .to.be.revertedWith('Too little received')

      await sweep.connect(balancer).setTargetPrice(999000, 999000);
      expect(await marketmaker.getBuyPrice()).to.lessThan(await sweep.ammPrice());

      mmUBB = await usdc.balanceOf(marketmaker.address);
      mmSBB = await sweep.balanceOf(marketmaker.address);
      pUBB = await usdc.balanceOf(poolAddress);
      sUBB = await sweep.balanceOf(poolAddress);

      amount = toBN("500", 18);
      await marketmaker.buySweepOnAMM(amount, 1e5);

      expect(await usdc.balanceOf(marketmaker.address)).to.equal(mmUBB.sub(amount));
      expect(await sweep.balanceOf(marketmaker.address)).to.greaterThan(mmSBB);
      expect(await usdc.balanceOf(poolAddress)).to.greaterThan(pUBB);
      expect(await sweep.balanceOf(poolAddress)).to.lessThan(sUBB);
    })

    it('adds single side liquidity for SWEEP correctly', async () => {
      sweepSingleAmount0 = toBN("1000", 18);
      amount = toBN("10000", 18);
      tickSpread = 10000;

      assetValue = await marketmaker.assetValue();
      sweepPoolBalance = await sweep.balanceOf(poolAddress);

      expect(await sweep.ammPrice()).to.greaterThan(await sweep.targetPrice());
      expect(await marketmaker.growPosition()).to.equal(0);
      await marketmaker.lpGrow(sweepSingleAmount0, tickSpread, 5000);

      sweepBalance = await sweep.balanceOf(poolAddress);
      expect(sweepBalance).to.greaterThan(sweepPoolBalance);
      growPosition = await marketmaker.growPosition();
      expect(growPosition).to.greaterThan(0);

      sweepSingleAmount1 = toBN("2000", 18);
      await marketmaker.lpGrow(sweepSingleAmount1, tickSpread, 5000);
      expect(await marketmaker.growPosition()).to.not.equal(growPosition);
    });

    it('removes the grow position id', async () => {
      positionId = await marketmaker.growPosition();
      sweepBalance = await sweep.balanceOf(marketmaker.address);
      tickSpread = 1000;

      expect(positionId).to.not.equal(0);
      await marketmaker.burnGrowPosition();

      expect(await marketmaker.growPosition()).to.equal(0);
      expect(await sweep.balanceOf(marketmaker.address)).to.greaterThan(sweepBalance);

      sweepSingleAmount2 = toBN("2000", 18);
      await marketmaker.lpGrow(sweepSingleAmount2, tickSpread, 5000);
      expect(await marketmaker.growPosition()).to.greaterThan(0);
    })

    it('removes redeem position correctly', async () => {
      marketBalance = await usdc.balanceOf(marketmaker.address)
      poolBalance = await usdc.balanceOf(poolAddress)

      await marketmaker.burnRedeemPosition();

      expect(await usdc.balanceOf(marketmaker.address)).to.closeTo(marketBalance.add(usdcSingleAmount1), 1);
      expect(await usdc.balanceOf(poolAddress)).to.closeTo(poolBalance.sub(usdcSingleAmount1), 1);
      expect(await marketmaker.redeemPosition()).to.equal(0);
    });
  })
});

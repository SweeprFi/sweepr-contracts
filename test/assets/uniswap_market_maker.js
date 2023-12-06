const { expect } = require("chai");
const { ethers } = require("hardhat");
const { chainlink, uniswap } = require("../../utils/constants");
const { Const, getPriceAndData, toBN } = require("../../utils/helper_functions");
let poolAddress;

contract('Uniswap Market Maker', async () => {
  before(async () => {
    [owner, borrower, treasury, guest, lzEndpoint, multisig] = await ethers.getSigners();
  
    usdxAmount = toBN("10000000", 6); // 10M
    sweepAmount = toBN("10000000", 18); // 10M
    minAutoSweepAmount = toBN("100", 18);
    BORROWER = owner.address;
    FEE = 500;

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
      0, Const.spreadFee, sweepAmount, Const.ZERO, Const.DAY, Const.RATIO,
      minAutoSweepAmount, Const.ZERO, Const.TRUE, Const.FALSE, Const.URL
    );
  });

  describe("main functions", async function () {
    it('create the pool and adds liquidity', async () => {
      const { token0, token1, sqrtPriceX96 } = getPriceAndData(sweep.address, usdc.address, 0, 0);
      expect(await factory.getPool(token0, token1, FEE)).to.equal(Const.ADDRESS_ZERO);
      expect(await marketmaker.assetValue()).to.equal(0);
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

      await usdc.approve(marketmaker.address, usdxAmount);
      await marketmaker.initPool(usdxAmount, sweepAmount, 0, 0);

      expect(await usdc.balanceOf(poolAddress)).to.greaterThan(Const.ZERO);
      expect(await sweep.balanceOf(poolAddress)).to.greaterThan(Const.ZERO);
      expect(await marketmaker.assetValue()).to.greaterThan(Const.ZERO);
    });

    it('adds liquidity', async () => {
      await usdc.transfer(marketmaker.address, usdxAmount.mul(4));
      expect(await sweep.isMintingAllowed()).to.equal(Const.TRUE);

      usdcPoolBalance = await usdc.balanceOf(poolAddress);
      sweepPoolBalance = await sweep.balanceOf(poolAddress);

      await usdc.approve(marketmaker.address, usdxAmount);
      await marketmaker.addLiquidity(usdxAmount, sweepAmount, 0, 0);

      expect(await usdc.balanceOf(poolAddress)).to.greaterThan(usdcPoolBalance);
      expect(await sweep.balanceOf(poolAddress)).to.greaterThan(sweepPoolBalance);
    });

    it('changes the price swaping and add liquidity again', async () => {
      ammPrice = await sweep.ammPrice()
      usdcBefore = await usdc.balanceOf(marketmaker.address);
      sweepBefore = await sweep.balanceOf(marketmaker.address);

      usdxAmount = toBN("5000", 6);
      await marketmaker.buySweepOnAMM(usdxAmount, 2000)

      expect(await sweep.ammPrice()).to.greaterThan(ammPrice)
      expect(await usdc.balanceOf(marketmaker.address)).to.equal(usdcBefore.sub(usdxAmount))
      expect(await sweep.balanceOf(marketmaker.address)).to.greaterThan(sweepBefore)

      usdcPoolBalance = await usdc.balanceOf(poolAddress);
      sweepPoolBalance = await sweep.balanceOf(poolAddress);

      usdxAmount = toBN("10000", 6);
      sweepAmount = toBN("10000", 18);

      await usdc.approve(marketmaker.address, usdxAmount);
      await marketmaker.addLiquidity(usdxAmount, sweepAmount, 0, 0);

      expect(await usdc.balanceOf(poolAddress)).to.greaterThan(usdcPoolBalance);
      expect(await sweep.balanceOf(poolAddress)).to.greaterThan(sweepPoolBalance);
    });

    it('removes liquidity', async () => {
      usdcPoolBalance = await usdc.balanceOf(poolAddress);
      sweepPoolBalance = await sweep.balanceOf(poolAddress);

      liquidity = await marketmaker.liquidity();
      liquidity = liquidity.div(3);

      await marketmaker.removeLiquidity(liquidity, 0, 0)

      expect(await usdc.balanceOf(poolAddress)).to.be.lessThan(usdcPoolBalance);
      expect(await sweep.balanceOf(poolAddress)).to.be.lessThan(sweepPoolBalance);
    });

    it('buys sweep from MM directly', async () => {
      expect(await sweep.balanceOf(borrower.address)).to.equal(0)
      
      usdcPoolBalance = await usdc.balanceOf(poolAddress);
      sweepPoolBalance = await sweep.balanceOf(poolAddress);
      buyAmount = toBN("5000", 18);
      buyUSDC = toBN("6000", 6);

      await usdc.transfer(borrower.address, buyUSDC)
      await usdc.connect(borrower).approve(marketmaker.address, buyUSDC);
      await marketmaker.connect(borrower).buySweep(buyAmount, 5e5);
      
      expect(await sweep.balanceOf(borrower.address)).to.equal(buyAmount);
      expect(await usdc.balanceOf(poolAddress)).to.greaterThan(usdcPoolBalance);
      expect(await sweep.balanceOf(poolAddress)).to.greaterThan(sweepPoolBalance);
    });

    it('adds single side liquidty correctly', async () => {
      usdcPoolBalance = await usdc.balanceOf(poolAddress);
      assetValue = await marketmaker.assetValue();
      singleAmount0 = toBN("3000", 6);
      tickSpread = 1000;

      await usdc.approve(marketmaker.address, singleAmount0);
      await marketmaker.addSingleLiquidity(singleAmount0, tickSpread);
      position0 = await marketmaker.positionIds(0);

      usdcBalance = await usdc.balanceOf(poolAddress);
      expect(usdcBalance).to.equal(usdcPoolBalance.add(singleAmount0));
      expect(position0).to.greaterThan(0);

      singleAmount1 = toBN("4000", 6);
      tickSpread = 1000;

      await usdc.approve(marketmaker.address, singleAmount1);
      await marketmaker.addSingleLiquidity(singleAmount1, tickSpread);
      position1 = await marketmaker.positionIds(1);

      expect(await usdc.balanceOf(poolAddress)).to.equal(usdcBalance.add(singleAmount1));
      expect(await marketmaker.assetValue()).to.greaterThan(assetValue);
      expect(position1).to.greaterThan(0);
    });

    it('removes first position correctly', async () => {
      marketBalance = await usdc.balanceOf(marketmaker.address)
      poolBalance = await usdc.balanceOf(poolAddress)

      await marketmaker.removePosition(position0);

      expect(await usdc.balanceOf(marketmaker.address)).to.closeTo(marketBalance.add(singleAmount0), 1);
      expect(await usdc.balanceOf(poolAddress)).to.closeTo(poolBalance.sub(singleAmount0), 1);
      expect(await marketmaker.positionIds(0)).to.equal(position1);
    });
  })
});

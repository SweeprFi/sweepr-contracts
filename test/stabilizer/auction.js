const { ethers } = require('hardhat');
const { expect } = require("chai");
const { chainlink, uniswap, tokens, wallets } = require("../../utils/constants");
const {
  impersonate, toBN, sendEth, getPriceAndData,
  Const, increaseTime, getBlockTimestamp
} = require("../../utils/helper_functions");

contract('Stabilizer - Auction', async () => {
  before(async () => {
    [owner, guest, lzEndpoint, treasury, liquidator] = await ethers.getSigners();
    // Variables
    usdxAmount = 1000e6;
    depositAmount = 10e6;
    investAmount = 200e6;
    outAmount = 29e6;
    sellAmount = toBN("60", 18);
    borrowAmount = toBN("100", 18);
    maxBorrow = toBN("100", 18);
    sweepAmount = toBN("1000", 18);

    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [
      lzEndpoint.address,
      owner.address,
      2500 // 0.25%
    ]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);

    ERC20 = await ethers.getContractFactory("ERC20");
    usdx = await ERC20.attach(tokens.usdc);
    weth = await ERC20.attach(tokens.weth);

    UniswapAMM = await ethers.getContractFactory("UniswapAMM");
    factory = await ethers.getContractAt("IUniswapV3Factory", uniswap.factory);
    positionManager = await ethers.getContractAt("INonfungiblePositionManager", uniswap.positions_manager);
    LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
    liquidityHelper = await LiquidityHelper.deploy();

    WETHAsset = await ethers.getContractFactory("ERC20Asset");
    asset = await WETHAsset.deploy(
      'WETH Asset',
      sweep.address,
      tokens.usdc,
      tokens.weth,
      chainlink.usdc_usd,
      chainlink.weth_usd,
      owner.address,
      uniswap.pool_weth
    );
  });

  describe("Dutch auction", async function () {
    it('setup', async () => {
      const { token0, token1, sqrtPriceX96 } =
        getPriceAndData(sweep.address, usdx.address, sweepAmount, usdxAmount);

      await positionManager.createAndInitializePoolIfNecessary(token0, token1, 500, sqrtPriceX96)
      pool_address = await factory.getPool(token0, token1, 500);

      pool = await ethers.getContractAt("IUniswapV3Pool", pool_address);
      await (await pool.increaseObservationCardinalityNext(96)).wait();

      amm = await UniswapAMM.deploy(
        sweep.address,
        usdx.address,
        chainlink.sequencer,
        pool_address,
        chainlink.usdc_usd,
        86400,
        liquidityHelper.address
      );
      await sweep.setAMM(amm.address);

      // add asset as a minter
      await sweep.addMinter(asset.address, sweepAmount);
      await sweep.addMinter(owner.address, sweepAmount);
      await sweep.mint(sweepAmount);

      // simulates a pool in uniswap with 10000 SWEEP/USDX
      await sweep.transfer(liquidator.address, sweepAmount);
      await sweep.transfer(pool_address, sweepAmount);

      user = await impersonate(wallets.usdc_holder);
      await sendEth(user.address);
      await usdx.connect(user).transfer(pool_address, usdxAmount);
      await usdx.connect(user).transfer(owner.address, usdxAmount);

      // config stabilizer
      await asset.configure(
        Const.DECREASE_FACTOR,
        Const.spreadFee,
        sweepAmount,
        Const.DECREASE_FACTOR,
        Const.DAYS_5,
        Const.RATIO,
        borrowAmount,
        Const.MIN_LIQUIDATION,
        Const.TRUE,
        Const.TRUE,
        Const.URL
      );

      // deposit into the asset, takes debt and invest
      await usdx.transfer(asset.address, depositAmount);
      await asset.borrow(borrowAmount);
      await asset.invest(investAmount, 5000);

      expect(await asset.isDefaulted()).to.equal(false);
      expect(await usdx.balanceOf(asset.address)).to.equal(0);
      expect(await asset.assetValue()).to.above(0);
    });

    it('start the auction correctly', async () => {
      await expect(asset.startAuction()).to.be.revertedWithCustomError(asset, "NotDefaulted");
      // set a new config
      await asset.configure(
        Const.RATIO,
        Const.spreadFee,
        maxBorrow,
        Const.DECREASE_FACTOR,
        Const.DAYS_5,
        Const.RATIO,
        borrowAmount,
        Const.MIN_LIQUIDATION,
        Const.TRUE,
        Const.TRUE,
        Const.URL
      );

      expect(await asset.isDefaulted()).to.equal(true);

      await asset.connect(guest).startAuction();
      timestamp = await getBlockTimestamp();
      debt = await asset.getDebt();

      expect(await asset.startingTime()).to.equal(timestamp);
      expect(await asset.startingPrice()).to.above(debt);
    });

    it('decreases the price over the time', async () => {
      startingPrice = await asset.getAuctionAmount();

      await increaseTime(300);
      after5minutes = await asset.getAuctionAmount();
      expect(startingPrice).to.above(after5minutes);

      await increaseTime(300);
      after10minutes = await asset.getAuctionAmount();
      expect(after5minutes).to.above(after10minutes);
    });

    it('the price do not decreases more that the minimum', async () => {
      await increaseTime(Const.DAY);
      after1day = await asset.getAuctionAmount();
      expect(after10minutes).to.above(after1day);

      await increaseTime(Const.DAY);
      after2day = await asset.getAuctionAmount();

      expect(after1day).to.equal(after2day);
      expect(borrowAmount.div(2)).to.equal(after2day);
    });

    it('can not start the auction twice', async () => {
      await expect(asset.startAuction())
        .to.be.revertedWithCustomError(asset, "ActionNotAllowed");
    });

    it('can not liquidate if the auction is configured', async () => {
      await expect(asset.startAuction())
        .to.be.revertedWithCustomError(asset, "ActionNotAllowed");
    });

    it('liquidate the asset by buying the auction correctly', async () => {
      expect(await await sweep.balanceOf(liquidator.address)).to.equal(sweepAmount);
      expect(await sweep.balanceOf(asset.address)).to.above(0);
      expect(await weth.balanceOf(liquidator.address)).to.equal(0);

      await sweep.connect(liquidator).approve(asset.address, sweepAmount);
      await asset.connect(liquidator).buyAuction();

      expect(await usdx.balanceOf(asset.address)).to.equal(0);
      expect(await weth.balanceOf(liquidator.address)).to.above(0);
      expect(await asset.sweepBorrowed()).to.below(borrowAmount);
    });

    it('cancel auction by repaying the debt correctly', async () => {
      expect(await asset.isDefaulted()).to.equal(true);
      expect(await asset.startingTime()).to.above(0);
      expect(await asset.startingPrice()).to.above(debt);

      debt = await asset.getDebt();
      await sweep.transfer(asset.address, debt);
      await asset.repay(debt);

      expect(await asset.isDefaulted()).to.equal(false);
      expect(await asset.startingTime()).to.equal(0);
      expect(await asset.startingPrice()).to.equal(0);
    });
  });
});

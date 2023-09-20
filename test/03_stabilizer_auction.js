const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses } = require("../utils/address");
const {
  impersonate, toBN, sendEth,
  Const, increaseTime, getBlockTimestamp
} = require("../utils/helper_functions");

contract.only('Stabilizer - Auction', async () => {
  before(async () => {
    [owner, guest, lzEndpoint, liquidator] = await ethers.getSigners();
    // Variables
    usdxAmount = 1000e6;
    depositAmount = 10e6;
    investAmount = 200e6;
    outAmount = 29e6;
    sellAmount = toBN("30", 18);
    borrowAmount = toBN("90", 18);
    maxBorrow = toBN("100", 18);
    sweepAmount = toBN("1000", 18);

    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [
      lzEndpoint.address,
      owner.address,
      2500 // 0.25%
    ]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(addresses.treasury);

    ERC20 = await ethers.getContractFactory("ERC20");
    usdx = await ERC20.attach(addresses.usdc_e);
    aave_usdx = await ERC20.attach(addresses.aave_usdc);

    Uniswap = await ethers.getContractFactory("UniswapMock");
    uniswap_amm = await Uniswap.deploy(sweep.address, Const.FEE);
    await sweep.setAMM(uniswap_amm.address);

    AaveAsset = await ethers.getContractFactory("AaveV3Asset");
    aaveAsset = await AaveAsset.deploy(
      'Aave Asset',
      sweep.address,
      addresses.usdc_e,
      addresses.aave_usdc,
      addresses.aaveV3_pool,
      addresses.oracle_usdc_usd,
      owner.address
    );
  });

  describe("Dutch auction", async function () {
    it('setup', async () => {
      // add asset as a minter
      await sweep.addMinter(aaveAsset.address, sweepAmount);
      await sweep.addMinter(owner.address, sweepAmount);
      await sweep.mint(sweepAmount);

      // simulates a pool in uniswap with 10000 SWEEP/USDX
      await sweep.transfer(liquidator.address, sweepAmount);
      await sweep.transfer(uniswap_amm.address, sweepAmount);
      await sweep.transfer(addresses.multisig, sweepAmount);

      user = await impersonate(addresses.usdc_e);
      await sendEth(user.address);
      await usdx.connect(user).transfer(uniswap_amm.address, usdxAmount);
      await usdx.connect(user).transfer(owner.address, usdxAmount);

      // config stabilizer
      await aaveAsset.configure(
        Const.DISCOUNT,
        Const.spreadFee,
        maxBorrow,
        Const.DISCOUNT,
        Const.DAYS_5,
        Const.RATIO,
        borrowAmount,
        Const.TRUE,
        Const.URL
      );

      await sweep.approve(aaveAsset.address, sweepAmount);

      // deposit into the asset, takes debt and invest
      await usdx.transfer(aaveAsset.address, depositAmount);
      await aaveAsset.borrow(borrowAmount);
      await aaveAsset.sellSweepOnAMM(sellAmount, outAmount);
      await aaveAsset.invest(investAmount);

      expect(await aaveAsset.isDefaulted()).to.equal(false);
      expect(await usdx.balanceOf(aaveAsset.address)).to.equal(0);
      expect(await aaveAsset.assetValue()).to.above(0);
    });

    it('start the auction correctly', async () => {
      await expect(aaveAsset.startAuction()).to.be.revertedWithCustomError(aaveAsset, "NotDefaulted");
      // set a new config
      await aaveAsset.configure(
        Const.RATIO,
        Const.spreadFee,
        maxBorrow,
        Const.DISCOUNT,
        Const.DAYS_5,
        Const.RATIO,
        borrowAmount,
        Const.TRUE,
        Const.URL
      );

      expect(await aaveAsset.isDefaulted()).to.equal(true);

      await aaveAsset.connect(guest).startAuction();
      timestamp = await getBlockTimestamp();
      debt = await aaveAsset.getDebt();

      expect(await aaveAsset.startingTime()).to.equal(timestamp);
      expect(await aaveAsset.startingPrice()).to.above(debt);
    });

    it('decreases the price over the time', async () => {
      await aaveAsset.startAuction();
      startingPrice = await aaveAsset.getAuctionAmount();

      await increaseTime(Const.DAY * 30);
      after30Days = await aaveAsset.getAuctionAmount();
      expect(startingPrice).to.above(after30Days);

      await increaseTime(Const.DAY * 30);
      after60Days = await aaveAsset.getAuctionAmount();
      expect(after30Days).to.above(after60Days);
    });

    it('liquidate the asset by buying the auction correctly', async () => {
      aaveBalance = await aave_usdx.balanceOf(aaveAsset.address);
      sweepBalance = await sweep.balanceOf(aaveAsset.address);
      
      expect(await aave_usdx.balanceOf(liquidator.address)).to.equal(0);
      expect(await await sweep.balanceOf(liquidator.address)).to.equal(sweepAmount);
      expect(aaveBalance).to.above(0);
      expect(sweepBalance).to.above(0);

      await sweep.connect(liquidator).approve(aaveAsset.address, sweepAmount);
      await aaveAsset.connect(liquidator).buyAuction();

      expect(await aave_usdx.balanceOf(liquidator.address)).to.equal(aaveBalance);
      expect(await await sweep.balanceOf(liquidator.address)).to.below(sweepAmount);
      expect(await aave_usdx.balanceOf(aaveAsset.address)).to.equal(0);
      expect(await sweep.balanceOf(aaveAsset.address)).to.equal(0);
      expect(await aaveAsset.sweepBorrowed()).to.below(borrowAmount);
    });

    it('cancel auction by repaying the debt correctly', async () => {
      expect(await aaveAsset.isDefaulted()).to.equal(true);
      expect(await aaveAsset.startingTime()).to.above(0);
      expect(await aaveAsset.startingPrice()).to.above(debt);

      debt = await aaveAsset.getDebt();
      await sweep.transfer(aaveAsset.address, debt);
      await aaveAsset.repay(debt);

      expect(await aaveAsset.isDefaulted()).to.equal(false);
      expect(await aaveAsset.startingTime()).to.equal(0);
      expect(await aaveAsset.startingPrice()).to.equal(0);
    });
  })
});


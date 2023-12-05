const { expect } = require("chai");
const { ethers } = require("hardhat");
const { network, tokens, chainlink, uniswap, wallets } = require("../../../utils/constants");
const { impersonate, sendEth, increaseTime, Const, toBN, getBlockTimestamp } = require("../../../utils/helper_functions");

contract("Backed IB01 Asset", async function () {
  if (Number(network.id) !== 1) return;

  before(async () => {
    [borrower, liquidator, treasury, lzEndpoint] = await ethers.getSigners();
    // Variables
    usdxAmount = 5000e6;
    depositBacked = toBN("100", 18);
    maxSweep = toBN("100000", 18);
    borrowAmount = toBN("50000", 18);
    withdrawAmount = toBN("8000", 18);

    SWEEP_ADDRESS = tokens.sweep;
    USDC_ADDRESS = tokens.usdc;
    BACKED_ADDRESS = tokens.backed;
    USDC_HOLDER = wallets.usdc_holder;
    BACKED_HOLDER = wallets.backed_holder;
    // ------------- Deployment of contracts -------------
    sweep = await ethers.getContractAt("SweepCoin", SWEEP_ADDRESS);
    Token = await ethers.getContractFactory("ERC20");
    usdc = await Token.attach(USDC_ADDRESS);
    backed = await Token.attach(BACKED_ADDRESS);

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(SWEEP_ADDRESS, uniswap.pool_sweep);

    Balancer = await ethers.getContractFactory("Balancer");
    balancer = await Balancer.deploy(SWEEP_ADDRESS, lzEndpoint.address);

    Asset = await ethers.getContractFactory("EmptyAsset");
    asset = await Asset.deploy(
      'Backed IB01 Asset',
      SWEEP_ADDRESS,
      USDC_ADDRESS,
      BACKED_ADDRESS,
      chainlink.usdc_usd,
      chainlink.backed_usd,
      borrower.address
    );

    // configure the asset
    await asset.configure(
      4e4, // 4%
      0,
      maxSweep,
      Const.DECREASE_FACTOR, // 0,8%
      Const.DAY * 6,
      0, 0, 5e5, false, true, Const.URL
    );

    OWNER = await sweep.owner();
    await sendEth(OWNER);
    SWEEP_OWNER = await impersonate(OWNER);
    await sweep.connect(SWEEP_OWNER).setAMM(amm.address);
    await sweep.connect(SWEEP_OWNER).addMinter(asset.address, maxSweep);
    await sweep.connect(SWEEP_OWNER).setBalancer(balancer.address);

    await sweep.connect(SWEEP_OWNER).addMinter(liquidator.address, maxSweep);
    await sweep.connect(liquidator).mint(maxSweep);
  });

  describe("invest and divest functions", async function () {
    it("borrow correctly", async function () {
      await sendEth(BACKED_HOLDER);
      user = await impersonate(BACKED_HOLDER);
      await backed.connect(user).transfer(asset.address, depositBacked);
      expect(await sweep.balanceOf(asset.address)).to.equal(Const.ZERO);
      await asset.borrow(borrowAmount);
      expect(await sweep.balanceOf(asset.address)).to.equal(borrowAmount);
    });

    it("withdraw correctly", async function () {
      await asset.withdraw(sweep.address, withdrawAmount);
      expect(await sweep.balanceOf(asset.address)).to.below(borrowAmount);
    });

    it("default the asset correctly", async function () {
      await balancer.connect(SWEEP_OWNER).addActions([asset.address], [borrowAmount]);
      await balancer.connect(SWEEP_OWNER).execute(2, true, 1e6, 2000);
      await increaseTime(Const.DAY * 7);

      expect(await asset.callTime()).to.greaterThan(0);
      expect(await asset.isDefaulted()).to.equal(true);
      expect(await asset.callAmount()).to.equal(withdrawAmount);
      expect(await sweep.balanceOf(asset.address)).to.equal(0);
    });

    it("liquidate the asset", async function () {
      expect(await backed.balanceOf(liquidator.address)).to.equal(0)
      await asset.connect(liquidator).startAuction();
      timestamp = await getBlockTimestamp();
      debt = await asset.getDebt();

      expect(await asset.startingTime()).to.equal(timestamp);
      expect(await asset.startingPrice()).to.above(debt);

      startingPrice = await asset.getAuctionAmount();

      await increaseTime(300);
      after5minutes = await asset.getAuctionAmount();
      expect(startingPrice).to.above(after5minutes);

      await increaseTime(300);
      after10minutes = await asset.getAuctionAmount();
      expect(after5minutes).to.above(after10minutes);

      auctionPrice = await asset.getAuctionAmount();

      await sweep.connect(liquidator).approve(asset.address, auctionPrice);
      await asset.connect(liquidator).buyAuction();

      expect(await asset.currentValue()).to.equal(0);
      expect(await asset.assetValue()).to.equal(0);
      expect(await backed.balanceOf(asset.address)).to.equal(0);
      expect(await sweep.balanceOf(asset.address)).to.equal(0);
      expect(await backed.balanceOf(liquidator.address)).to.equal(depositBacked)

      // bad debt
      expect(await asset.sweepBorrowed()).to.greaterThan(0);
      expect(await asset.isDefaulted()).to.equal(true);
    });
  });
});

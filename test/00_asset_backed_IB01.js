const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses, chainId } = require("../utils/address");
const { impersonate, sendEth, increaseTime, Const, toBN, getBlockTimestamp } = require("../utils/helper_functions");

contract.only("Backed IB01 Asset", async function () {
  if (Number(chainId) !== 1) return;

  before(async () => {
    [borrower, liquidator, treasury, lzEndpoint] = await ethers.getSigners();
    // Variables
    usdxAmount = 5000e6;
    depositBacked = toBN("100", 18);
    maxSweep = toBN("100000", 18);
    borrowAmount = toBN("50000", 18);
    withdrawAmount = toBN("8000", 18);

    USDC_ADDRESS = addresses.usdc;
    BACKED_ADDRESS = addresses.backedIB01;
    USDC_HOLDER = addresses.usdc_holder;
    BACKED_HOLDER = addresses.backed_holder;
    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, borrower.address, 2500]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);

    Token = await ethers.getContractFactory("ERC20");
    usdc = await Token.attach(USDC_ADDRESS);
    backed = await Token.attach(BACKED_ADDRESS);

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address, Const.FEE);
    await sweep.setAMM(amm.address);

    Balancer = await ethers.getContractFactory("Balancer");
    balancer = await Balancer.deploy(sweep.address, lzEndpoint.address);

    Asset = await ethers.getContractFactory("BaseTokenAsset");
    asset = await Asset.deploy(
      'Backed IB01 Asset',
      sweep.address,
      USDC_ADDRESS,
      BACKED_ADDRESS,
      addresses.oracle_usdc_usd,
      addresses.oracle_backedIB01_usd,
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
    // add asset as a minter
    await sweep.addMinter(asset.address, maxSweep);
    await sweep.setBalancer(balancer.address);
    await sweep.transfer(liquidator.address, maxSweep);
  });

  describe("invest and divest functions", async function () {
    it('deposit into the asset', async () => {
      await sendEth(BACKED_HOLDER);
      user = await impersonate(BACKED_HOLDER);
      await backed.connect(user).transfer(asset.address, depositBacked);
      expect(await backed.balanceOf(asset.address)).to.equal(depositBacked);
    });

    it("borrow correctly", async function () {
      expect(await sweep.balanceOf(asset.address)).to.equal(Const.ZERO);
      await asset.borrow(borrowAmount);
      expect(await sweep.balanceOf(asset.address)).to.equal(borrowAmount);
    });

    it("withdraw correctly", async function () {
      await asset.withdraw(sweep.address, withdrawAmount);
      expect(await sweep.balanceOf(asset.address)).to.below(borrowAmount);
    });

    it("deafult the asset correctly", async function () {
      await balancer.addActions([asset.address], [borrowAmount]);
      await balancer.execute(2, true, 1e6, 2000);
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

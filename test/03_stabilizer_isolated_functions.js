const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { Const, toBN, increaseTime } = require("../utils/helper_functions");

contract("Stabilizer - Isolated Functions", async function () {
  before(async () => {
    [owner, borrower, wallet, treasury, other, multisig, lzEndpoint, agent] = await ethers.getSigners();
    usdxAmount = 10000e6;
    sweepAmount = toBN("10000", 18);
    mintAmount = toBN("90", 18);
    tenSweep = toBN("10", 18);
    maxBorrow = toBN("100", 18);

    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [
      lzEndpoint.address,
      owner.address,
      750 // 0.00274% daily rate = 1% yearly rate
    ]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(addresses.treasury);

    Token = await ethers.getContractFactory("USDCMock");
    usdx = await Token.deploy();
    usdt = await Token.deploy();

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address, Const.FEE);
    await sweep.setAMM(amm.address);

    OffChainAsset = await ethers.getContractFactory("OffChainAsset");

    offChainAsset = await OffChainAsset.deploy(
      'OffChain Asset',
      sweep.address,
      usdx.address,
      wallet.address,
      agent.address,
      addresses.oracle_usdc_usd,
      borrower.address
    );

    await offChainAsset.connect(borrower).configure(
      Const.RATIO,
      Const.spreadFee,
      maxBorrow,
      Const.ZERO,
      Const.DAYS_5,
      Const.RATIO,
      maxBorrow,
      Const.ZERO,
      Const.FALSE,
      Const.FALSE,
      Const.URL
    );

    // ------------- Initialize context -------------
    await usdx.transfer(borrower.address, usdxAmount);
    await sweep.transfer(other.address, maxBorrow);
    await sweep.transfer(borrower.address, tenSweep);
    await usdx.connect(borrower).approve(offChainAsset.address, 10000e6);
    await sweep.connect(borrower).approve(offChainAsset.address, tenSweep);
    await sweep.connect(other).approve(offChainAsset.address, maxBorrow);

    // simulates a pool in uniswap with 10000 SWEEP/USDX
    await sweep.addMinter(owner.address, sweepAmount.mul(2));
    await sweep.connect(owner).mint(sweepAmount.mul(2));
    await sweep.connect(owner).transfer(amm.address, sweepAmount);
    await sweep.connect(owner).transfer(other.address, sweepAmount);
    await usdx.transfer(amm.address, usdxAmount);
  });

  describe("get the junior investment", async function () {
    it("gets the value of the junior tranche before and after of deposit", async function () {
      expect(await offChainAsset.getJuniorTrancheValue()).to.be.equal(Const.ZERO);
      await usdx.connect(borrower).transfer(offChainAsset.address, 20e6);
      expect(await offChainAsset.getJuniorTrancheValue()).to.be.above(Const.ZERO);
    });
  });

  describe("mint function", async function () {
    describe("mints correctly", async function () {
      it("takes debt into the senior tranche", async function () {
        await sweep.addMinter(offChainAsset.address, maxBorrow);
        ratioBefore = await offChainAsset.getEquityRatio();
        expect(ratioBefore).to.be.equal(1e6); // 100%

        await offChainAsset.connect(borrower).borrow(mintAmount);

        ratioAfter = await offChainAsset.getEquityRatio();
        expect(ratioBefore).to.be.above(ratioAfter);
        expect(await offChainAsset.sweepBorrowed()).to.equal(mintAmount);
      });
    });
  });

  describe("invest function", async function () {
    it("sends sweep to the offChainAsset correctly", async function () {
      expect(await usdx.balanceOf(offChainAsset.address)).to.equal(20e6);
      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(mintAmount);
      expect(await offChainAsset.assetValue()).to.equal(Const.ZERO);
      expect(await offChainAsset.currentValue()).to.above(Const.ZERO); // 20 USDC - 90 SWEEP
      expect(await usdx.balanceOf(wallet.address)).to.equal(Const.ZERO);
      expect(await sweep.balanceOf(wallet.address)).to.equal(Const.ZERO);

      await offChainAsset.connect(borrower).invest(20e6, mintAmount.mul(2));

      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);
      expect(await usdx.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);

      expect(await sweep.balanceOf(wallet.address)).to.equal(mintAmount);
      expect(await usdx.balanceOf(wallet.address)).to.equal(20e6);
    });
  });

  describe("payback and repay functions", async function () {
    it("tries to swap without balance", async function () {
      await expect(offChainAsset.connect(borrower).buySweepOnAMM(tenSweep, 0))
        .to.be.revertedWithCustomError(offChainAsset, "NotEnoughBalance");
    });

    it("change the usdx for sweep ", async function () {
      await sweep.transfer(wallet.address, tenSweep);

      expect(await sweep.balanceOf(wallet.address)).to.equal(maxBorrow);
    });

    it("tries pay fee without balance", async function () {
      await increaseTime(2 * 24 * 3600); // delay 2 days
      expect(await sweep.balanceOf(offChainAsset.address)).to.eq(Const.ZERO);
      expect(await offChainAsset.getDebt()).to.above(Const.ZERO);
      await expect(offChainAsset.connect(borrower).payFee())
        .to.be.revertedWithCustomError(offChainAsset, "SpreadNotEnough");
    });

    it("tries to repay without balance", async function () {
      await expect(offChainAsset.connect(borrower).repay(maxBorrow))
        .to.be.revertedWithCustomError(offChainAsset, 'NotEnoughBalance');
    });

    it("receives sweep correctly", async function () {
      await offChainAsset.connect(borrower).divest(maxBorrow);

      expect(await offChainAsset.redeemMode()).to.equal(Const.TRUE);
      await sweep.connect(wallet).transfer(offChainAsset.address, maxBorrow);

      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(maxBorrow);
      expect(await sweep.balanceOf(wallet.address)).to.equal(Const.ZERO);
    });

    it("burns sweeps token correctly", async function () {
      expect(await offChainAsset.sweepBorrowed()).to.equal(mintAmount);
      await offChainAsset.connect(borrower).repay(maxBorrow);
    });
  });

  describe("withdraw function", async function () {
    it("withdraws sweep correctly", async function () {
      expect(await offChainAsset.getEquityRatio()).to.equal(1e6); // 100%      
      balance = await sweep.balanceOf(offChainAsset.address);

      await expect(offChainAsset.connect(borrower).withdraw(usdt.address, balance))
        .to.be.revertedWithCustomError(offChainAsset, "InvalidToken")


      await offChainAsset.connect(borrower).withdraw(sweep.address, balance);
    });
  });

  describe("buy & sell SWEEP from stabilizer", async function () {
    it("tries to buy without balance", async function () {
      await expect(offChainAsset.connect(borrower).swapUsdxToSweep(usdxAmount))
        .to.be.revertedWithCustomError(offChainAsset, 'NotEnoughBalance');
    });

    it("buy SWEEP", async function () {
      usdxAmount = toBN("50", 6);
      expectSweepAmount = toBN("50", 18);

      await offChainAsset.connect(borrower).borrow(mintAmount);

      sweepBalanceBefore = await sweep.balanceOf(borrower.address);
      usdxBalanceBefore = await usdx.balanceOf(offChainAsset.address);

      await offChainAsset.connect(borrower).swapUsdxToSweep(usdxAmount);

      expect(await sweep.balanceOf(borrower.address)).to.above(sweepBalanceBefore);
      expect(await usdx.balanceOf(offChainAsset.address)).to.above(usdxBalanceBefore);
    });

    it("sell SWEEP through the AMM", async function () {
      balance = await sweep.balanceOf(offChainAsset.address);
      usdxBalanceBefore = await usdx.balanceOf(offChainAsset.address);
      await offChainAsset.connect(borrower).sellSweepOnAMM(balance, 0);
      expect(await usdx.balanceOf(offChainAsset.address)).to.above(usdxBalanceBefore);
      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);
    });

    it("buy SWEEP through the AMM", async function () {
      usdxAmount = toBN("50", 6);
      sweepAmount = toBN("49.975", 18); // 50 * 0.9995 (0.05% fee of uniswap)
      balanceBefore = await usdx.balanceOf(offChainAsset.address);

      await offChainAsset.connect(borrower).buySweepOnAMM(usdxAmount, 0);

      balanceAfter = await usdx.balanceOf(offChainAsset.address);

      expect(balanceAfter.add(usdxAmount)).to.equal(balanceBefore);
      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(sweepAmount);
    });

    it("Sell SWEEP", async function () {
      sweepAmount = toBN("30", 18);
      sweepBalanceBefore = await sweep.balanceOf(offChainAsset.address);
      usdxBalanceBefore = await usdx.balanceOf(borrower.address);

      targetPrice = await sweep.targetPrice();
      expectUSXAmount = (30e6 * targetPrice) / 1e6;

      await sweep.connect(borrower).approve(offChainAsset.address, sweepAmount);
      await expect(offChainAsset.connect(borrower).swapSweepToUsdx(sweepAmount.mul(5)))
        .to.be.revertedWithCustomError(offChainAsset, "NotEnoughBalance");

      await offChainAsset.connect(borrower).swapSweepToUsdx(sweepAmount);

      expect(await sweep.balanceOf(offChainAsset.address)).to.above(sweepBalanceBefore);
      expect(await usdx.balanceOf(borrower.address)).to.above(usdxBalanceBefore);
    });
  });
});

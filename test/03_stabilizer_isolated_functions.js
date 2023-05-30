const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { Const, toBN, impersonate } = require("../utils/helper_functions");

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
      addresses.owner,
      2500 // 0.25%
    ]);
    sweep = await Proxy.deployed();
    user = await impersonate(addresses.owner);
    await sweep.connect(user).setTreasury(addresses.treasury);

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
      borrower.address
    );

    await offChainAsset.connect(borrower).configure(
      Const.RATIO,
      Const.SPREAD_FEE,
      maxBorrow,
      Const.DISCOUNT,
      Const.DAYS_5,
      Const.RATIO,
      maxBorrow,
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
    await sweep.minter_mint(amm.address, sweepAmount);
    await sweep.minter_mint(other.address, sweepAmount);
    await usdx.transfer(amm.address, usdxAmount);
  });

  describe("get the junior investment", async function () {
    it("gets the value of the junior tranche before and after of deposit", async function () {
      expect(await offChainAsset.getJuniorTrancheValue()).to.be.equal(Const.ZERO);
      await usdx.connect(borrower).transfer(offChainAsset.address, 10e6);
      expect(await offChainAsset.getJuniorTrancheValue()).to.be.equal(10e6);
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
        expect(ratioAfter).to.be.equal(1e5); // 10%
        expect(ratioBefore > ratioAfter).to.be.equal(Const.TRUE);
        expect(await offChainAsset.sweep_borrowed()).to.equal(mintAmount);
      });
    });
  });

  describe("invest function", async function () {
    it("sends sweep to the offChainAsset correctly", async function () {
      expect(await usdx.balanceOf(offChainAsset.address)).to.equal(10e6);
      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(mintAmount);
      expect(await offChainAsset.assetValue()).to.equal(Const.ZERO);
      expect(await offChainAsset.currentValue()).to.equal(100e6); // 10 USDC - 90 SWEEP
      expect(await usdx.balanceOf(wallet.address)).to.equal(Const.ZERO);
      expect(await sweep.balanceOf(wallet.address)).to.equal(Const.ZERO);

      await offChainAsset.connect(borrower).invest(20e6, mintAmount.mul(2));

      expect(await offChainAsset.currentValue()).to.equal(100e6);
      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);
      expect(await usdx.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);

      expect(await sweep.balanceOf(wallet.address)).to.equal(mintAmount);
      expect(await usdx.balanceOf(wallet.address)).to.equal(10e6);
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

      expect(await offChainAsset.redeem_mode()).to.equal(Const.TRUE);
      await sweep.connect(wallet).transfer(offChainAsset.address, maxBorrow);

      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(maxBorrow);
      expect(await sweep.balanceOf(wallet.address)).to.equal(Const.ZERO);
    });

    it("burns sweeps token correctly", async function () {
      expect(await offChainAsset.sweep_borrowed()).to.equal(mintAmount);
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

      sweepBalanceAfter = sweepBalanceBefore.add(expectSweepAmount);
      usdxBalanceAfter = usdxBalanceBefore.add(usdxAmount);

      expect(await sweep.balanceOf(borrower.address)).to.equal(sweepBalanceAfter);
      expect(await usdx.balanceOf(offChainAsset.address)).to.equal(usdxBalanceAfter);
    });

    it("sell SWEEP through the AMM", async function () {
      balance = await sweep.balanceOf(offChainAsset.address);
      await offChainAsset.connect(borrower).sellSweepOnAMM(balance, 0);

      expect(await usdx.balanceOf(offChainAsset.address)).to.equal(89980000);
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

      targetPrice = await sweep.target_price();
      expectUSXAmount = (30e6 * targetPrice) / 1e6;

      await sweep.connect(borrower).approve(offChainAsset.address, sweepAmount);
      await expect(offChainAsset.connect(borrower).swapSweepToUsdx(sweepAmount.mul(5)))
        .to.be.revertedWithCustomError(offChainAsset, "NotEnoughBalance");

      await offChainAsset.connect(borrower).swapSweepToUsdx(sweepAmount);

      sweepBalanceAfter = sweepBalanceBefore.add(sweepAmount);
      usdxBalanceAfter = usdxBalanceBefore.add(expectUSXAmount);
      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(sweepBalanceAfter);
      expect(await usdx.balanceOf(borrower.address)).to.equal(usdxBalanceAfter);
    });
  });
});

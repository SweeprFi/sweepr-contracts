const { expect } = require("chai");
const { ethers } = require("hardhat");
const { Const, toBN, increaseTime } = require("../../utils/helper_functions");

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
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, owner.address, 750]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);

    Token = await ethers.getContractFactory("USDCMock");
    usdx = await Token.deploy(6);
    usdt = await Token.deploy(6);

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address, owner.address);
    await sweep.setAMM(amm.address);

    Oracle = await ethers.getContractFactory("AggregatorMock");
    usdcOracle = await Oracle.deploy();

    OffChainAsset = await ethers.getContractFactory("OffChainAsset");
    offChainAsset = await OffChainAsset.deploy(
      'OffChain Asset',
      sweep.address,
      usdx.address,
      wallet.address,
      agent.address,
      usdcOracle.address,
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
      await expect(offChainAsset.connect(borrower).buySweepOnAMM(tenSweep, 2000))
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

  describe("buy & sell SWEEP from stabilizer", async function () {
    it("sell SWEEP through the AMM", async function () {
      balance = await sweep.balanceOf(offChainAsset.address);
      usdxBalanceBefore = await usdx.balanceOf(offChainAsset.address);
      await offChainAsset.connect(borrower).sellSweepOnAMM(balance, 2000);
      expect(await usdx.balanceOf(offChainAsset.address)).to.above(usdxBalanceBefore);
      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);
    });

    it("buy SWEEP through the AMM", async function () {
      usdxAmount = toBN("50", 6);
      sweepAmount = toBN("49.975", 18); // 50 * 0.9995 (0.05% fee of uniswap)
      balanceBefore = await usdx.balanceOf(offChainAsset.address);

      await offChainAsset.connect(borrower).buySweepOnAMM(usdxAmount, 2000);
      balanceAfter = await usdx.balanceOf(offChainAsset.address);
      expect(balanceBefore).to.greaterThan(balanceAfter);
    });
  });
});

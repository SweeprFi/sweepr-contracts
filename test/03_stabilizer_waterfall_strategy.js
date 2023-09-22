const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { Const, toBN, impersonate } = require("../utils/helper_functions");

contract("Stabilizer's waterfall workflow", async function () {
  before(async () => {
    [owner, borrower, wallet, treasury, multisig, lzEndpoint, agent] = await ethers.getSigners();
    priceHigh = 1.01e6;
    priceLow = 0.99e6;
    price = 1e6;

    usdxAmount = 1000e6;
    sweepAmount = toBN("1000", 18);
    maxBorrow = toBN("100", 18);
    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [
      lzEndpoint.address,
      owner.address,
      2500 // 0.25%
    ]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(addresses.treasury);

    Token = await ethers.getContractFactory("USDCMock");
    usdx = await Token.deploy();

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

    // usd to the borrower to he can invest
    await usdx.transfer(borrower.address, 50e6);
    await sweep.transfer(borrower.address, maxBorrow.mul(2));

    // owner/borrower/asset approve offChainAsset to spend
    await usdx.approve(offChainAsset.address, usdxAmount);
    await usdx.connect(borrower).approve(offChainAsset.address, usdxAmount);

    // add offChainAsset to minter list
    await sweep.addMinter(offChainAsset.address, maxBorrow);

    // set collateral agent
    await offChainAsset.connect(borrower).setCollateralAgent(borrower.address)
  });

  describe("initial state", async function () {
    it("globals are set to defaults", async function () {
      expect(await usdx.balanceOf(borrower.address)).to.equal(50e6);
      expect(await usdx.allowance(borrower.address, offChainAsset.address)).to.equal(usdxAmount);

      expect(await usdx.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);
      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);
      expect(await offChainAsset.sweepBorrowed()).to.equal(Const.ZERO);

      expect(await offChainAsset.paused()).to.equal(Const.FALSE);
      expect(await offChainAsset.assetValue()).to.equal(Const.ZERO);
      expect(await offChainAsset.minEquityRatio()).to.equal(Const.RATIO);

      expect(await offChainAsset.borrower()).to.equal(borrower.address);

      expect(await offChainAsset.sweep()).to.equal(sweep.address);
      expect(await offChainAsset.usdx()).to.equal(usdx.address);
    });
  });

  describe("deposit + invest + withdraw circuit", async function () {
    describe("when asking for less sweep than the max borrow", async function () {
      it("deposits 20 usd", async function () {
        await usdx.connect(borrower).transfer(offChainAsset.address, 20e6);
        expect(await usdx.balanceOf(offChainAsset.address)).to.equal(20e6);
        expect(await offChainAsset.getEquityRatio()).to.equal(1e6); // 100%
      });

      it("mints and sells requested sweeps, and sends investment to the asset", async function () {
        amount = toBN("90", 18);

        await offChainAsset.connect(borrower).borrow(amount);
        expect(await usdx.balanceOf(offChainAsset.address)).to.equal(20e6);
        expect(await sweep.balanceOf(offChainAsset.address)).to.equal(amount);
        expect(await offChainAsset.sweepBorrowed()).to.equal(amount);

        await offChainAsset.connect(borrower).invest(20e6, amount);

        expect(await sweep.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);
        expect(await sweep.balanceOf(wallet.address)).to.equal(amount);
        expect(await usdx.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);
        expect(await usdx.balanceOf(wallet.address)).to.equal(20e6);
        expect(await offChainAsset.sweepBorrowed()).to.equal(amount);
      });
    });

    describe("repaying in 3 payments", async function () {
      it("simulates change of usdx for sweep and 10% interest", async function () {
        amount = toBN("20", 18);
        await sweep.transfer(wallet.address, amount);
        balance = await sweep.balanceOf(wallet.address);
        balance = await sweep.convertToUSD(balance);

        await offChainAsset.connect(borrower).updateValue(balance);
      });

      it("repays less than the senior debt, buys sweeps and burns it", async function () {
        amount = toBN("80", 18);
        await offChainAsset.connect(borrower).divest(amount);
        await sweep.connect(wallet).transfer(offChainAsset.address, amount);
        expect(await sweep.balanceOf(offChainAsset.address)).to.equal(amount);

        await offChainAsset.connect(borrower).repay(amount);
        expect(await offChainAsset.getEquityRatio()).to.closeTo(909090, 1000); // 90%
      });

      it("repays more than the senior debt", async function () {
        amount = toBN("15", 18);
        burnAmount = toBN("10", 18);
        await offChainAsset.connect(borrower).divest(amount);
        await sweep.connect(wallet).transfer(offChainAsset.address, amount);

        await offChainAsset.connect(borrower).repay(burnAmount);
        expect(await offChainAsset.getEquityRatio()).to.equal(1e6); // 100%
      });

      it("divests to cover entire loan amount", async function () {
        await offChainAsset.connect(borrower).divest(amount);
        await sweep.connect(wallet).transfer(offChainAsset.address, amount);
        expect(await offChainAsset.getEquityRatio()).to.equal(1e6); // 100%
      });
    });

    describe("borrower takes the profits", async function () {
      it("checks state after borrower withdraws", async function () {
        await offChainAsset.connect(borrower).withdraw(sweep.address, burnAmount.mul(2));
      });
    });
  });

  describe("borrower deposit and withdraw without investing", async function () {
    it("checks that borrower withdraw the deposit", async function () {
      borrowerBalance = await sweep.balanceOf(borrower.address);
      depositAmount = toBN("10", 18);;
      await sweep.connect(borrower).transfer(offChainAsset.address, depositAmount);
      await offChainAsset.connect(borrower).withdraw(sweep.address, depositAmount);
    });
  });
});

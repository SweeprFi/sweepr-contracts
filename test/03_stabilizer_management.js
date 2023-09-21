const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { Const, toBN, impersonate } = require("../utils/helper_functions");

contract("Stabilizer - Management Functions", async function () {
  before(async () => {
    [owner, borrower, wallet, treasury, multisig, lzEndpoint, balancer, agent] = await ethers.getSigners();
    maxBorrow = toBN("100", 18);
    newLoanLimit = toBN("90", 18);
    autoInvestAmount = toBN("10", 18);
    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [
      lzEndpoint.address,
      multisig.address,
      2500 // 0.25%
    ]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(addresses.treasury);
    await sweep.setBalancer(balancer.address);

    Token = await ethers.getContractFactory("USDCMock");
    usdx = await Token.deploy();

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address, Const.FEE);
    await sweep.setAMM(amm.address);

    OffChainAsset = await ethers.getContractFactory("OffChainAsset");
    // ------------- Initialize context -------------
    offChainAsset = await OffChainAsset.deploy(
      'OffChain Asset',
      sweep.address,
      usdx.address,
      wallet.address,
      agent.address,
      addresses.oracle_usdc_usd,
      borrower.address
    );

    await usdx.connect(borrower).approve(offChainAsset.address, 10000e6);
  });

  describe("management constraints", async function () {
    it("only borrower can mint", async function () {
      amount = toBN("40", 18);
      await expect(offChainAsset.connect(owner).borrow(amount))
        .to.be.revertedWithCustomError(offChainAsset, 'NotBorrower');
    });

    it("only multisig can pause the stabilizer", async function () {
      await expect(offChainAsset.connect(borrower).pause())
        .to.be.revertedWithCustomError(offChainAsset, 'NotMultisigOrGov');
    });

    it("only balancer can change the loan limit", async function () {
      await expect(offChainAsset.connect(borrower).setLoanLimit(maxBorrow))
        .to.be.revertedWithCustomError(offChainAsset, 'NotBalancer');
    });
  });

  describe("management settings correctly", async function () {
    it("set a new configuration", async function () {
      expect(await offChainAsset.settingsEnabled()).to.equal(Const.TRUE);
      expect(await offChainAsset.minEquityRatio()).to.equal(Const.ZERO);
      expect(await offChainAsset.spreadFee()).to.equal(Const.ZERO);
      expect(await offChainAsset.loanLimit()).to.equal(Const.ZERO);
      expect(await offChainAsset.decreaseFactor()).to.equal(Const.ZERO);
      expect(await offChainAsset.callDelay()).to.equal(Const.ZERO);
      expect(await offChainAsset.link()).to.equal("");

      await expect(offChainAsset.connect(multisig)
        .configure(
          Const.RATIO,
          Const.RATIO,
          maxBorrow,
          Const.RATIO,
          Const.FEE,
          Const.RATIO,
          autoInvestAmount,
          Const.ZERO,
          Const.TRUE,
          Const.FALSE,
          Const.URL
        )
      ).to.be.revertedWithCustomError(offChainAsset, 'NotBorrower');

      await offChainAsset.connect(borrower)
        .configure(
          Const.RATIO,
          Const.RATIO,
          maxBorrow,
          Const.RATIO,
          Const.FEE,
          Const.RATIO,
          autoInvestAmount,
          Const.ZERO,
          Const.TRUE,
          Const.FALSE,
          Const.URL
        );

      expect(await offChainAsset.minEquityRatio()).to.equal(Const.RATIO);
      expect(await offChainAsset.spreadFee()).to.equal(Const.RATIO);
      expect(await offChainAsset.loanLimit()).to.equal(maxBorrow);
      expect(await offChainAsset.decreaseFactor()).to.equal(Const.RATIO);
      expect(await offChainAsset.callDelay()).to.equal(Const.FEE);

      expect(await offChainAsset.link()).to.equal(Const.URL);
    });

    it("set a new loan limit", async function () {
      expect(await offChainAsset.loanLimit()).to.equal(maxBorrow);
      await offChainAsset.connect(balancer).setLoanLimit(newLoanLimit);
      expect(await offChainAsset.loanLimit()).to.equal(newLoanLimit);
    });

    it("set a new settings manager", async function () {
      expect(await offChainAsset.settingsEnabled()).to.equal(Const.TRUE);
      await offChainAsset.connect(borrower).propose();

      await expect(offChainAsset.connect(borrower)
        .configure(
          Const.RATIO,
          Const.RATIO,
          maxBorrow,
          Const.RATIO,
          Const.FEE,
          Const.RATIO,
          autoInvestAmount,
          Const.ZERO,
          Const.TRUE,
          Const.FALSE,
          Const.URL
        )
      ).to.be.revertedWithCustomError(offChainAsset, 'SettingsDisabled');

      expect(await offChainAsset.settingsEnabled()).to.equal(Const.FALSE);
    });

    it("rejects the proposed and rollback the settings manager", async function () {
      expect(await offChainAsset.settingsEnabled()).to.equal(Const.FALSE);
      await offChainAsset.connect(owner).reject();
      expect(await offChainAsset.settingsEnabled()).to.equal(Const.TRUE);
    });

    it("set pause correctly", async function () {
      expect(await offChainAsset.paused()).to.equal(Const.FALSE);
      await offChainAsset.connect(multisig).pause();
      expect(await offChainAsset.paused()).to.equal(Const.TRUE);
    });
  });

  describe("stabilizer constraints", async function () {
    it("cannot mint if stabilizer was paused", async function () {
      await expect(offChainAsset.connect(borrower).borrow(amount))
        .to.be.revertedWith("Pausable: paused");
    });

    it("cannot invest if stabilizer was paused", async function () {
      await expect(offChainAsset.connect(borrower).invest(sweep.address, amount))
        .to.be.revertedWith("Pausable: paused");
    });

    it("cannot withdraw if stabilizer was paused", async function () {
      await expect(offChainAsset.connect(borrower).withdraw(sweep.address, amount))
        .to.be.revertedWith("Pausable: paused");
    });

    it("not a valid minter", async function () {
      await offChainAsset.connect(multisig).unpause();
      await expect(offChainAsset.connect(borrower).borrow(amount))
        .to.be.revertedWithCustomError(offChainAsset, 'InvalidMinter');
    });

    it("maximum mint amount has been reached", async function () {
      await sweep.addMinter(offChainAsset.address, maxBorrow);
      amount = toBN("101", 18);
      await expect(offChainAsset.connect(borrower).borrow(amount))
        .to.be.revertedWithCustomError(offChainAsset, 'NotEnoughBalance');
    });

    it("next equity ratio will be lower than the minimum", async function () {
      amount = toBN("10", 18);
      await expect(offChainAsset.connect(borrower).borrow(amount))
        .to.be.revertedWithCustomError(offChainAsset, 'EquityRatioExcessed');
    });

    it("only borrower can invest", async function () {
      await expect(offChainAsset.invest(sweep.address, amount))
        .to.be.revertedWithCustomError(offChainAsset, 'NotBorrower');
    });

    it("only borrower can burn sweep", async function () {
      await expect(offChainAsset.connect(wallet).repay(amount))
        .to.be.revertedWithCustomError(offChainAsset, 'NotBorrower');
    });

    it("tries to withdraw all balance", async function () {
      balance = await usdx.balanceOf(offChainAsset.address);
      await expect(offChainAsset.connect(borrower).withdraw(sweep.address, Const.ZERO))
        .to.be.revertedWithCustomError(offChainAsset, 'OverZero');
    });

    it("tries to withdraw more than the junior tranche value", async function () {
      mintAmount = toBN("9", 18);
      depositAmount = toBN("1", 18);
      withdrawAmount = toBN("10", 18);
      await sweep.transfer(offChainAsset.address, depositAmount);
      await offChainAsset.connect(borrower).borrow(mintAmount);

      await expect(offChainAsset.connect(borrower).withdraw(sweep.address, withdrawAmount))
        .to.be.revertedWithCustomError(offChainAsset, 'EquityRatioExcessed');
    });

    it("tries to withdraw more that the current balance", async function () {
      balance = await sweep.balanceOf(offChainAsset.address);
      await expect(offChainAsset.connect(borrower).withdraw(sweep.address, balance.add(depositAmount)))
        .to.be.revertedWithCustomError(offChainAsset, 'NotEnoughBalance');
    });

    it("burn with more amount that the current balance", async function () {
      burnAmount = toBN("1000", 18);
      await offChainAsset.connect(borrower).repay(burnAmount);
      restAmount = await sweep.balanceOf(offChainAsset.address);
      expect(restAmount).to.above(Const.ZERO);
    });
  });
});

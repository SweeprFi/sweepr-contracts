const { expect } = require("chai");
const { ethers } = require("hardhat");
const { Const, toBN } = require("../../utils/helper_functions");

contract("Stabilizer - Management Functions", async function () {
  before(async () => {
    [owner, borrower, wallet, treasury, multisig, lzEndpoint, balancer, agent] = await ethers.getSigners();
    maxBorrow = toBN("100", 18);
    newLoanLimit = toBN("90", 18);
    autoInvestAmount = toBN("10", 18);
    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, multisig.address, 2500]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);
    await sweep.setBalancer(balancer.address);

    Token = await ethers.getContractFactory("USDCMock");
    usdx = await Token.deploy(6);

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address, agent.address);
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
      expect(await offChainAsset.protocolFee()).to.equal(Const.ZERO);
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
          500,
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
          500,
          Const.RATIO,
          autoInvestAmount,
          Const.ZERO,
          Const.TRUE,
          Const.FALSE,
          Const.URL
        );

      expect(await offChainAsset.minEquityRatio()).to.equal(Const.RATIO);
      expect(await offChainAsset.protocolFee()).to.equal(Const.RATIO);
      expect(await offChainAsset.loanLimit()).to.equal(maxBorrow);
      expect(await offChainAsset.decreaseFactor()).to.equal(Const.RATIO);
      expect(await offChainAsset.callDelay()).to.equal(500);

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
          500,
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
      expect(await offChainAsset.paused()).to.equal(Const.TRUE);
      await offChainAsset.connect(multisig).unpause();
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
      await usdx.transfer(offChainAsset.address, 5e6);
      await offChainAsset.connect(multisig).unpause();
      await expect(offChainAsset.connect(borrower).borrow(amount))
        .to.be.revertedWithCustomError(offChainAsset, 'InvalidMinter');
    });

    it("maximum mint amount has been reached", async function () {
      await sweep.addMinter(offChainAsset.address, maxBorrow);
      amount = toBN("50", 18);
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

    it("tries to withdraw zero", async function () {
      balance = await usdx.balanceOf(offChainAsset.address);
      await expect(offChainAsset.connect(borrower).withdraw(sweep.address, Const.ZERO))
        .to.be.revertedWithCustomError(offChainAsset, 'OverZero');
    });

    it("only governance can change the borrower", async function () {
      await expect(offChainAsset.connect(wallet).changeBorrower(wallet.address))
        .to.be.revertedWithCustomError(offChainAsset, 'NotGovernance');
    });

    it("changes the borrower correctly", async function () {
      expect(await offChainAsset.borrower()).to.equal(borrower.address)
      await offChainAsset.changeBorrower(wallet.address);

      expect(await offChainAsset.borrower()).to.equal(wallet.address)
      await expect(offChainAsset.connect(borrower).withdraw(sweep.address, autoInvestAmount))
        .to.be.revertedWithCustomError(offChainAsset, 'NotBorrower');
    });
  });
});

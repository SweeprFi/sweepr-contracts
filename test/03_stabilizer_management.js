const { expect } = require("chai");
const { ethers } = require("hardhat");

contract("Stabilizer - Management Functions", async function () {
  before(async () => {
    [owner, borrower, wallet, treasury, multisig, lzEndpoint, balancer] = await ethers.getSigners();
    maxBorrow = ethers.utils.parseUnits("100", 18);
    newLoanLimit = ethers.utils.parseUnits("90", 18);
    minimumEquityRatio = 1e4; // 1%
    spreadFee = 1e4; // 1%
    autoInvestMinEquityRatio = 10e4; // 10%
    autoInvestMinAmount = ethers.utils.parseUnits("10", 18);
    autoInvest = true;
    ZERO = 0;
    ADDRESS_ZERO = ethers.constants.AddressZero;

    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);
    await sweep.setBalancer(balancer.address);

    Token = await ethers.getContractFactory("USDCMock");
    usdx = await Token.deploy();

    USDOracle = await ethers.getContractFactory("AggregatorMock");
    usdOracle = await USDOracle.deploy();

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address, usdOracle.address, ADDRESS_ZERO);

    OffChainAsset = await ethers.getContractFactory("OffChainAsset");
    // ------------- Initialize context -------------
    offChainAsset = await OffChainAsset.deploy(
      'OffChain Asset',
      sweep.address,
      usdx.address,
      wallet.address,
      amm.address,
      owner.address
    );

    await usdx.connect(borrower).approve(offChainAsset.address, 10000e6);
  });

  describe("management constraints", async function () {
    it("only borrower can mint", async function () {
      amount = ethers.utils.parseUnits("40", 18);
      await expect(offChainAsset.connect(borrower).borrow(amount))
        .to.be.revertedWithCustomError(offChainAsset, 'OnlyBorrower');
    });

    it("only admin can pause the stabilizer", async function () {
      await expect(offChainAsset.connect(borrower).pause())
        .to.be.revertedWithCustomError(offChainAsset, 'OnlyAdmin');
    });

    it("only admin can change the borrower", async function () {
      await expect(offChainAsset.connect(borrower).setBorrower(borrower.address))
        .to.be.revertedWithCustomError(offChainAsset, 'OnlyAdmin');
    });

    it("only balancer can change the loan limit", async function () {
      await expect(offChainAsset.connect(borrower).setLoanLimit(maxBorrow))
        .to.be.revertedWithCustomError(offChainAsset, 'OnlyBalancer');
    });
  });

  describe("management settings correctly", async function () {
    it("set a new borrower", async function () {
      expect(await offChainAsset.borrower()).to.equal(owner.address);
      await offChainAsset.setBorrower(borrower.address);
      expect(await offChainAsset.borrower()).to.equal(borrower.address);
      expect(await offChainAsset.settings_enabled()).to.equal(true);
    });

    it("set a new configuration", async function () {
      expect(await offChainAsset.settings_enabled()).to.equal(true);
      expect(await offChainAsset.min_equity_ratio()).to.equal(ZERO);
      expect(await offChainAsset.spread_fee()).to.equal(ZERO);
      expect(await offChainAsset.loan_limit()).to.equal(ZERO);
      expect(await offChainAsset.liquidator_discount()).to.equal(ZERO);
      expect(await offChainAsset.call_delay()).to.equal(ZERO);
      expect(await offChainAsset.link()).to.equal("");

      await expect(offChainAsset.connect(multisig)
        .configure(
          1e4,
          1e4,
          maxBorrow,
          1e4,
          100,
          autoInvestMinEquityRatio,
          autoInvestMinAmount,
          autoInvest,
          "htttp://test.com"
        )
      ).to.be.revertedWithCustomError(offChainAsset, 'OnlyBorrower');

      await offChainAsset.connect(borrower)
        .configure(
          1e4,
          1e4,
          maxBorrow,
          1e4,
          100,
          autoInvestMinEquityRatio,
          autoInvestMinAmount,
          autoInvest,
          "htttp://test.com"
        );

      expect(await offChainAsset.min_equity_ratio()).to.equal(1e4);
      expect(await offChainAsset.spread_fee()).to.equal(1e4);
      expect(await offChainAsset.loan_limit()).to.equal(maxBorrow);
      expect(await offChainAsset.liquidator_discount()).to.equal(1e4);
      expect(await offChainAsset.call_delay()).to.equal(100);

      expect(await offChainAsset.link()).to.equal("htttp://test.com");
    });

    it("set a new loan limit", async function () {
      expect(await offChainAsset.loan_limit()).to.equal(maxBorrow);
      await offChainAsset.connect(balancer).setLoanLimit(newLoanLimit);
      expect(await offChainAsset.loan_limit()).to.equal(newLoanLimit);
    });

    it("set a new settings manager", async function () {
      expect(await offChainAsset.settings_enabled()).to.equal(true);
      await offChainAsset.connect(borrower).propose();

      await expect(offChainAsset.connect(borrower)
        .configure(
          1e4,
          1e4,
          maxBorrow,
          1e4,
          100,
          autoInvestMinEquityRatio,
          autoInvestMinAmount,
          autoInvest,
          "htttp://test.com"
        )
      ).to.be.revertedWithCustomError(offChainAsset, 'SettingsDisabled');

      expect(await offChainAsset.settings_enabled()).to.equal(false);
    });

    it("rejects the proposed and rollback the settings manager", async function () {
      expect(await offChainAsset.settings_enabled()).to.equal(false);
      await offChainAsset.connect(owner).reject();
      expect(await offChainAsset.settings_enabled()).to.equal(true);
    });

    it("set pause correctly", async function () {
      expect(await offChainAsset.paused()).to.equal(false);
      await offChainAsset.connect(owner).pause();
      expect(await offChainAsset.paused()).to.equal(true);
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
      await offChainAsset.connect(owner).unpause();
      await expect(offChainAsset.connect(borrower).borrow(amount))
        .to.be.revertedWithCustomError(offChainAsset, 'InvalidMinter');
    });

    it("maximum mint amount has been reached", async function () {
      await sweep.addMinter(offChainAsset.address, maxBorrow);
      amount = ethers.utils.parseUnits("101", 18);
      await expect(offChainAsset.connect(borrower).borrow(amount))
        .to.be.revertedWithCustomError(offChainAsset, 'NotEnoughBalance');
    });

    it("next equity ratio will be lower than the minimum", async function () {
      amount = ethers.utils.parseUnits("10", 18);
      await expect(offChainAsset.connect(borrower).borrow(amount))
        .to.be.revertedWithCustomError(offChainAsset, 'EquityRatioExcessed');
    });

    it("only borrower can invest", async function () {
      await expect(offChainAsset.invest(sweep.address, amount))
        .to.be.revertedWithCustomError(offChainAsset, 'OnlyBorrower');
    });

    it("only borrower can burn sweep", async function () {
      await expect(offChainAsset.connect(wallet).repay(amount))
        .to.be.revertedWithCustomError(offChainAsset, 'OnlyBorrower');
    });

    it("tries to withdraw all balance", async function () {
      balance = await usdx.balanceOf(offChainAsset.address);
      await expect(offChainAsset.connect(borrower).withdraw(sweep.address, ZERO))
        .to.be.revertedWithCustomError(offChainAsset, 'OverZero');
    });

    it("tries to withdraw more than the junior tranche value", async function () {
      mintAmount = ethers.utils.parseUnits("9", 18);
      depositAmount = ethers.utils.parseUnits("1", 18);
      withdrawAmount = ethers.utils.parseUnits("10", 18);
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
      burnAmount = ethers.utils.parseUnits("1000", 18);
      await offChainAsset.connect(borrower).repay(burnAmount);
      restAmount = await sweep.balanceOf(offChainAsset.address);
      expect(restAmount).to.above(0);
    });
  });
});

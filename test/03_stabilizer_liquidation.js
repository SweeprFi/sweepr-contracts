const { expect } = require("chai");
const { ethers, contract } = require("hardhat");
const { addresses } = require("../utils/address");
const { time } = require('@openzeppelin/test-helpers');

contract("Stabilizer - Liquidation", async function () {
  before(async () => {
    [borrower, liquidator, other] = await ethers.getSigners();
    // Stabilizer config
    maxBorrow = ethers.utils.parseUnits("100", 18);
    minEquityRatio = ethers.utils.parseUnits("1", 5); // 10%
    ratioDefault = ethers.utils.parseUnits("6", 5); // 10%
    spreadFee = ethers.utils.parseUnits("1", 4); // 1%
    liquidatorDiscount = ethers.utils.parseUnits("2", 5); // 2%
    callDelay = 604800; // 7 days
    autoInvestMinEquityRatio = 10e4; // 10%
    autoInvestMinAmount = ethers.utils.parseUnits("10", 18);
    autoInvest = true;
    // Constants
    ZERO = 0;
    usdcAmount = ethers.utils.parseUnits("10", 6);
    sweepAmount = ethers.utils.parseUnits("10", 18);
    sweepMintAmount = ethers.utils.parseUnits("50", 18);

    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepDollarCoin");
    sweep = await Sweep.attach(addresses.sweep);

    USDC = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
    WETH = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
    usdc = await USDC.attach(addresses.usdc);
    weth = await WETH.attach(addresses.weth);

    WETHAsset = await ethers.getContractFactory("TokenAsset");
    // ------------- Initialize context -------------
    weth_asset = await WETHAsset.deploy(
      'WETH Asset',
      addresses.sweep,
      addresses.usdc,
      addresses.weth,
      addresses.oracle_weth_usdc,
      addresses.uniswap_amm,
      addresses.borrower
    );
  });

  async function impersonate(account) {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [account]
    });
    user = await ethers.getSigner(account);
  }

  async function increaseTime() {
    await time.increase(86400);
    await time.advanceBlock();
  }

  describe("liquidates a WETH Asset when this is defaulted", async function () {
    it("environment setup", async function () {
      expect(await weth_asset.isDefaulted()).to.equal(false);
      amm_price = await sweep.amm_price();

      await impersonate(addresses.usdc);
      await usdc.connect(user).transfer(weth_asset.address, usdcAmount); // stabilizer deposit

      await impersonate(sweep_owner);
      await sweep.connect(user).setTargetPrice(amm_price, amm_price);
      await sweep.connect(user).addMinter(weth_asset.address, sweepMintAmount);

      existMinter = await sweep.isValidMinter(addresses.borrower)
      if (existMinter) {
        await sweep.connect(user).setMinterMaxAmount(addresses.borrower, sweepMintAmount.mul(2));
      } else {
        await sweep.connect(user).addMinter(addresses.borrower, sweepMintAmount.mul(2));
      }

      await impersonate(addresses.borrower);
      await weth_asset.connect(user).configure(
        minEquityRatio,
        spreadFee,
        maxBorrow,
        liquidatorDiscount,
        callDelay,
        autoInvestMinEquityRatio,
        autoInvestMinAmount,
        autoInvest,
        "htttp://test.com"
      );

      await sweep.connect(user).minter_mint(liquidator.address, sweepMintAmount);
    });

    it("stabilizer takes a debt and invest into WETH Asset", async function () {
      expect(await weth_asset.assetValue()).to.equal(ZERO);
      expect(await weth_asset.isDefaulted()).to.equal(false);
      await increaseTime();

      amount = sweepAmount.mul(2)
      await weth_asset.connect(user).borrow(amount);
      await weth_asset.connect(user).sellSweepOnAMM(amount, ZERO);

      balance = await usdc.balanceOf(weth_asset.address);
      await weth_asset.connect(user).invest(balance);

      expect(await weth_asset.currentValue()).to.not.equal(ZERO);
    });

    it("liquidations correctly", async function () {
      expect(await weth_asset.sweep_borrowed()).to.equal(amount);
      expect(await weth_asset.isDefaulted()).to.equal(false);

      currentValueBefore = await weth_asset.assetValue();
      wethBalanceBefore = await weth.balanceOf(liquidator.address);

      await weth_asset.connect(user).configure(
        ratioDefault,
        spreadFee,
        maxBorrow,
        liquidatorDiscount,
        callDelay,
        autoInvestMinEquityRatio,
        autoInvestMinAmount,
        autoInvest,
        "htttp://test.com"
      );

      expect(await weth_asset.isDefaulted()).to.equal(true);

      await sweep.connect(liquidator).approve(weth_asset.address, sweepMintAmount);
      await weth_asset.connect(liquidator).liquidate();

      wethBalanceAfter = await weth.balanceOf(liquidator.address);
      currentValueAfter = await weth_asset.assetValue();

      expect(await weth_asset.isDefaulted()).to.equal(false);
      expect(await weth_asset.sweep_borrowed()).to.equal(ZERO);
      expect(await weth_asset.getDebt()).to.equal(ZERO);
      expect(currentValueBefore).to.above(ZERO);
      expect(currentValueAfter).to.equal(ZERO);
      expect(wethBalanceAfter).to.above(wethBalanceBefore);
    });

    it("can not liquidate a Stabilizer after has been liquidated", async function () {
      await expect(weth_asset.connect(liquidator).liquidate())
        .to.be.revertedWithCustomError(weth_asset, 'NotDefaulted');
    });
  });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { impersonate, sendEth, Const, toBN } = require("../utils/helper_functions");

contract("Stabilizer - Liquidation", async function () {
  before(async () => {
    [borrower, liquidator, other, treasury, lzEndpoint] = await ethers.getSigners();

    maxBorrow = toBN("100", 18);
    maxSweep = toBN("500000", 18);
    liquidatorBalance = toBN("100000", 18);
    RATIO_DEFAULT = 1e6;
    usdcAmount = toBN("10", 6);
    sweepAmount = toBN("10", 18);
    sweepMintAmount = toBN("50", 18);

    await sendEth(Const.WETH_HOLDER);
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

    USDC = await ethers.getContractFactory("ERC20");
    WETH = await ethers.getContractFactory("ERC20");
    usdc = await USDC.attach(addresses.usdc);
    weth = await WETH.attach(addresses.weth);

    Oracle = await ethers.getContractFactory("AggregatorMock");
    wethOracle = await Oracle.deploy();
    await wethOracle.setPrice(Const.WETH_PRICE);

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address, Const.FEE);
    await sweep.setAMM(amm.address);

    WETHAsset = await ethers.getContractFactory("TokenAsset");
    // ------------- Initialize context -------------
    weth_asset = await WETHAsset.deploy(
      'WETH Asset',
      sweep.address,
      addresses.usdc,
      addresses.weth,
      wethOracle.address,
      addresses.borrower
    );

    // simulates a pool in uniswap with 10000 SWEEP/USDX
    await sweep.addMinter(borrower.address, maxSweep);
    await sweep.minterMint(amm.address, maxBorrow);
    await sweep.minterMint(liquidator.address, liquidatorBalance);

    user = await impersonate(addresses.usdc)
    await usdc.connect(user).transfer(amm.address, 100e6);

    user = await impersonate(Const.WETH_HOLDER);
    await weth.connect(user).transfer(amm.address, maxBorrow);
  });

  describe("liquidates a WETH Asset when this is defaulted", async function () {
    it("environment setup", async function () {
      expect(await weth_asset.isDefaulted()).to.equal(Const.FALSE);
      ammPrice = await sweep.ammPrice();

      user = await impersonate(addresses.usdc);
      await usdc.connect(user).transfer(weth_asset.address, usdcAmount); // stabilizer deposit      
      await sweep.addMinter(weth_asset.address, sweepMintAmount);
      await sweep.addMinter(addresses.borrower, sweepMintAmount.mul(2));

      user = await impersonate(addresses.borrower);
      await weth_asset.connect(user).configure(
        Const.RATIO,
        Const.spreadFee,
        maxBorrow,
        Const.DISCOUNT,
        Const.DAYS_5,
        Const.RATIO,
        maxBorrow,
        Const.TRUE,
        Const.URL
      );
    });

    it("stabilizer takes a debt and invest into WETH Asset", async function () {
      expect(await weth_asset.assetValue()).to.equal(Const.ZERO);
      expect(await weth_asset.isDefaulted()).to.equal(Const.FALSE);

      amount = sweepAmount.mul(2)
      await weth_asset.connect(user).borrow(amount);
      await weth_asset.connect(user).sellSweepOnAMM(amount, Const.ZERO);

      balance = await usdc.balanceOf(weth_asset.address);
      await weth_asset.connect(user).invest(balance, Const.SLIPPAGE);

      expect(await weth_asset.currentValue()).to.not.equal(Const.ZERO);
      expect(await usdc.balanceOf(weth_asset.address)).to.equal(Const.ZERO);
    });

    it("liquidations correctly", async function () {
      expect(await weth_asset.sweepBorrowed()).to.equal(amount);
      expect(await weth_asset.isDefaulted()).to.equal(Const.FALSE);

      currentValueBefore = await weth_asset.assetValue();
      wethBalanceBefore = await weth.balanceOf(liquidator.address);

      await weth_asset.connect(user).configure(
        RATIO_DEFAULT,
        Const.spreadFee,
        maxBorrow,
        Const.DISCOUNT,
        Const.DAYS_5,
        Const.RATIO,
        maxBorrow,
        Const.TRUE,
        Const.URL
      );

      expect(await weth_asset.isDefaulted()).to.equal(Const.TRUE);

      await sweep.connect(liquidator).approve(weth_asset.address, liquidatorBalance);
      await weth_asset.connect(liquidator).liquidate();

      wethBalanceAfter = await weth.balanceOf(liquidator.address);
      currentValueAfter = await weth_asset.assetValue();

      expect(await weth_asset.isDefaulted()).to.equal(Const.FALSE);
      expect(await weth_asset.sweepBorrowed()).to.equal(Const.ZERO);
      expect(await weth_asset.getDebt()).to.equal(Const.ZERO);
      expect(currentValueBefore).to.above(Const.ZERO);
      expect(currentValueAfter).to.equal(Const.ZERO);
      expect(wethBalanceAfter).to.above(wethBalanceBefore);
    });

    it("can not liquidate a Stabilizer after has been liquidated", async function () {
      await expect(weth_asset.connect(liquidator).liquidate())
        .to.be.revertedWithCustomError(weth_asset, 'NotDefaulted');
    });
  });
});

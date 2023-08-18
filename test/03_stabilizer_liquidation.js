const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { impersonate, sendEth, Const, toBN } = require("../utils/helper_functions");

contract("Stabilizer - Liquidation", async function () {
  before(async () => {
    [owner, borrower, liquidator, other, treasury, lzEndpoint] = await ethers.getSigners();
    MAX_BORROW = toBN("100", 18);
    MAX_SWEEP = toBN("3000", 18);
    MAX_USDC = toBN("3000", 6);

    DEPOSIT_AMOUNT = toBN("10", 6);
    BORROW_AMOUNT = toBN("90", 18);
    INVEST_AMOUNT = toBN("200", 6);

    maxBorrow = toBN("100", 18);
    maxSweep = toBN("500000", 18);
    liquidatorBalance = toBN("100000", 18);
    RATIO_DEFAULT = 1e6;
    usdcAmount = toBN("10", 6);
    sweepAmount = toBN("10", 18);
    sweepMintAmount = toBN("50", 18);

    await sendEth(Const.WETH_HOLDER);
    await sendEth(addresses.dai_holder);
    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [
      lzEndpoint.address,
      owner.address,
      2500 // 0.25%
    ]);
    TOKEN = await ethers.getContractFactory("ERC20");
    Oracle = await ethers.getContractFactory("AggregatorMock");
    Uniswap = await ethers.getContractFactory("UniswapMock");

    Aave = await ethers.getContractFactory("AaveV3Asset");
    Compound = await ethers.getContractFactory("CompV3Asset");
    GDAI = await ethers.getContractFactory("GDAIAsset");
    WETH = await ethers.getContractFactory("TokenAsset");

    sweep = await Proxy.deployed();
    usdc = await TOKEN.attach(addresses.usdc);
    weth = await TOKEN.attach(addresses.weth);
    dai = await TOKEN.attach(addresses.dai);
    gdai = await TOKEN.attach(addresses.gDai);
    aave_usdx = await TOKEN.attach(addresses.aave_usdc);
    cusdc = await TOKEN.attach(addresses.comp_cusdc);

    wethOracle = await Oracle.deploy();
    amm = await Uniswap.deploy(sweep.address, Const.FEE);
    // ------------- deploy assets -------------
    aave_asset = await Aave.deploy(
      'Aave Asset',
      sweep.address,
      addresses.usdc,
      addresses.aave_usdc,
      addresses.aaveV3_pool,
      addresses.oracle_usdc_usd,
      borrower.address
    );

    comp_asset = await Compound.deploy(
      'Compound V3 Asset',
      sweep.address,
      addresses.usdc,
      addresses.comp_cusdc,
      addresses.oracle_usdc_usd,
      borrower.address
    );

    weth_asset = await WETH.deploy(
      'WETH Asset',
      sweep.address,
      addresses.usdc,
      addresses.weth,
      addresses.oracle_usdc_usd,
      wethOracle.address,
      borrower.address
    );

    assets = [aave_asset, comp_asset, weth_asset];
  });

  describe("liquidates assets", async function () {
    it("environment setup", async function () {
      await sweep.setTreasury(treasury.address);
      await sweep.setAMM(amm.address);
      await wethOracle.setPrice(Const.WETH_PRICE);
      await sweep.transfer(amm.address, MAX_SWEEP);
      await sweep.transfer(liquidator.address, MAX_SWEEP);

      user = await impersonate(addresses.usdc)
      await usdc.connect(user).transfer(amm.address, MAX_USDC);

      user = await impersonate(Const.WETH_HOLDER);
      await weth.connect(user).transfer(amm.address, MAX_SWEEP);

      user = await impersonate(addresses.dai_holder)
      await dai.connect(user).transfer(amm.address, MAX_SWEEP);

      await Promise.all(
        assets.map(async (asset) => {
          await asset.connect(borrower).configure(
            Const.RATIO, // 10%
            Const.spreadFee,
            MAX_BORROW,
            Const.DISCOUNT,
            Const.DAYS_5,
            Const.RATIO,
            MAX_BORROW,
            Const.TRUE,
            Const.URL
          );
        })
      );

      await Promise.all(
        assets.map(async (asset) => {
          await sweep.addMinter(asset.address, MAX_BORROW);
        })
      );
    });

    it("deposits, borrow and invest", async function () {
      user = await impersonate(addresses.usdc);
      await Promise.all(
        assets.map(async (asset) => {
          await usdc.connect(user).transfer(asset.address, DEPOSIT_AMOUNT);
        })
      );

      await Promise.all(
        assets.map(async (asset) => {
          await asset.connect(borrower).borrow(BORROW_AMOUNT);
        })
      );

      await Promise.all(
        assets.map(async (asset) => {
          await asset.connect(borrower).sellSweepOnAMM(BORROW_AMOUNT, Const.ZERO);
        })
      );

      await aave_asset.connect(borrower).invest(INVEST_AMOUNT);
      await comp_asset.connect(borrower).invest(INVEST_AMOUNT);

      await amm.setPrice(Const.WETH_AMM);
      await weth_asset.connect(borrower).invest(INVEST_AMOUNT, Const.SLIPPAGE);

      await Promise.all(
        assets.map(async (asset) => {
          expect(await asset.sweepBorrowed()).to.equal(BORROW_AMOUNT);
          expect(await asset.isDefaulted()).to.equal(Const.TRUE);
        })
      );
    });

    it("liquidates correctly", async function () {
      sweep_balance = await sweep.balanceOf(liquidator.address);
      aave_balance = await aave_usdx.balanceOf(liquidator.address);
      cusdc_balance = await cusdc.balanceOf(liquidator.address);
      weth_balance = await weth.balanceOf(liquidator.address);

      total = aave_balance.add(cusdc_balance).add(weth_balance);
      expect(total).to.be.equal(Const.ZERO);

      await sweep.connect(liquidator).approve(aave_asset.address, MAX_SWEEP);
      await sweep.connect(liquidator).approve(comp_asset.address, MAX_SWEEP);
      await sweep.connect(liquidator).approve(weth_asset.address, MAX_SWEEP);

      await Promise.all(
        assets.map(async (asset) => {
          await asset.connect(liquidator).liquidate();
        })
      );
      
      await Promise.all(
        assets.map(async (asset) => {
          expect(await asset.isDefaulted()).to.equal(Const.FALSE);
          expect(await asset.sweepBorrowed()).to.equal(Const.ZERO);
          expect(await asset.getDebt()).to.equal(Const.ZERO);
        })
      );

      expect(await sweep.balanceOf(liquidator.address)).to.be.lessThan(sweep_balance);
      expect(await aave_usdx.balanceOf(liquidator.address)).to.be.greaterThan(Const.ZERO);
      expect(await cusdc.balanceOf(liquidator.address)).to.be.greaterThan(Const.ZERO);
      expect(await weth.balanceOf(liquidator.address)).to.be.greaterThan(Const.ZERO);
    });

    it("can not liquidate a Stabilizer after has been liquidated", async function () {
      await Promise.all(
        assets.map(async (asset) => {
          await expect(asset.connect(liquidator).liquidate())
            .to.be.revertedWithCustomError(asset, 'NotDefaulted');
        })
      );
    });
  });
});

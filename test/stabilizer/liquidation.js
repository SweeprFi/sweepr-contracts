const { expect } = require("chai");
const { ethers } = require("hardhat");
const { tokens, chainlink, uniswap, wallets, protocols } = require("../../utils/constants");
const { impersonate, sendEth, Const, toBN } = require("../../utils/helper_functions");

contract("Stabilizer - Liquidation", async function () {
  before(async () => {
    [owner, borrower, liquidator, other, treasury, lzEndpoint] = await ethers.getSigners();
    MAX_BORROW = toBN("100", 18);
    MAX_SWEEP = toBN("1000", 18);
    MAX_USDC = toBN("1000", 6);

    DEPOSIT_AMOUNT = toBN("11", 6);
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
    await sendEth(wallets.usdc_holder);
    await sendEth(tokens.usdc_e);
    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, owner.address, 2500]);
    TOKEN = await ethers.getContractFactory("ERC20");
    Oracle = await ethers.getContractFactory("AggregatorMock");
    Uniswap = await ethers.getContractFactory("UniswapMock");

    Aave = await ethers.getContractFactory("AaveAsset");
    Compound = await ethers.getContractFactory("CompV3Asset");
    // GDAI = await ethers.getContractFactory("GDAIAsset");
    WETH = await ethers.getContractFactory("ERC20Asset");

    sweep = await Proxy.deployed();
    usdc = await TOKEN.attach(tokens.usdc);
    usdce = await TOKEN.attach(tokens.usdc_e);
    weth = await TOKEN.attach(tokens.weth);
    // dai = await TOKEN.attach(tokens.dai);
    // gdai = await TOKEN.attach(tokens.gDai);
    aave_usdx = await TOKEN.attach(protocols.aave.usdc);
    cusdc = await TOKEN.attach(tokens.comp_cusdc);

    wethOracle = await Oracle.deploy();
    amm = await Uniswap.deploy(sweep.address, owner.address);
    // ------------- deploy assets -------------

    aave_asset = await Aave.deploy(
      'Aave Asset',
      sweep.address,
      tokens.usdc,
      tokens.usdc_e,
      protocols.balancer.bpt_4pool,
      protocols.aave.usdc,
      protocols.aave.pool,
      chainlink.usdc_usd,
      borrower.address,
    );

    comp_asset = await Compound.deploy(
      'Compound V3 Asset',
      sweep.address,
      tokens.usdc_e,
      tokens.comp_cusdc,
      chainlink.usdc_usd,
      borrower.address
    );

    weth_asset = await WETH.deploy(
      'WETH Asset',
      sweep.address,
      tokens.usdc,
      tokens.weth,
      chainlink.usdc_usd,
      wethOracle.address,
      borrower.address,
      uniswap.pool_weth
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

      user = await impersonate(wallets.usdc_holder);
      await sendEth(user.address);
      await usdc.connect(user).transfer(amm.address, MAX_USDC);

      user = await impersonate(tokens.usdc_e);
      await usdce.connect(user).transfer(amm.address, MAX_USDC);

      user = await impersonate(Const.WETH_HOLDER);
      await weth.connect(user).transfer(amm.address, MAX_SWEEP);

      // user = await impersonate(wallets.dai_holder)
      // await dai.connect(user).transfer(amm.address, MAX_SWEEP);

      await Promise.all(
        assets.map(async (asset) => {
          await asset.connect(borrower).configure(
            Const.RATIO, // 10%
            Const.spreadFee,
            MAX_BORROW,
            Const.ZERO,
            Const.DAYS_5,
            Const.RATIO,
            MAX_BORROW,
            Const.ZERO,
            Const.TRUE,
            Const.FALSE,
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
      user = await impersonate(wallets.usdc_holder);
      await usdc.connect(user).transfer(assets[0].address, DEPOSIT_AMOUNT);
      await usdc.connect(user).transfer(assets[2].address, DEPOSIT_AMOUNT);

      user = await impersonate(tokens.usdc_e);
      await usdce.connect(user).transfer(assets[1].address, DEPOSIT_AMOUNT);

      await Promise.all(
        assets.map(async (asset) => {
          await asset.connect(borrower).borrow(BORROW_AMOUNT);
        })
      );

      await Promise.all(
        assets.map(async (asset) => {
          await asset.connect(borrower).sellSweepOnAMM(BORROW_AMOUNT, 2000);
        })
      );

      await aave_asset.connect(borrower).invest(INVEST_AMOUNT, 2000);
      await comp_asset.connect(borrower).invest(INVEST_AMOUNT);

      // await amm.setPrice(Const.WETH_AMM);
      // await weth_asset.connect(borrower).invest(INVEST_AMOUNT, 0);

      await Promise.all(
        assets.map(async (asset) => {
          await asset.connect(borrower).configure(
            2e5, // 10%
            Const.spreadFee,
            MAX_BORROW,
            Const.ZERO,
            Const.DAYS_5,
            Const.RATIO,
            MAX_BORROW,
            Const.ZERO,
            Const.TRUE,
            Const.FALSE,
            Const.URL
          );
        })
      );

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
      // expect(await aave_usdx.balanceOf(liquidator.address)).to.be.greaterThan(Const.ZERO);
      expect(await cusdc.balanceOf(liquidator.address)).to.be.greaterThan(Const.ZERO);
      // expect(await weth.balanceOf(liquidator.address)).to.be.greaterThan(Const.ZERO);
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

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { chainlink, uniswap, tokens, wallets, balancer } = require("../../utils/constants");
const { impersonate, sendEth, Const, toBN, getAddressAndProviders } = require("../../utils/helper_functions");
let user;

contract("Stabilizer - One step invest/divest", async function () {
  before(async () => {
    [owner, other, treasury, lzEndpoint] = await ethers.getSigners();

    BORROWER = owner.address;
    depositAmount = 100e6;
    withdrawAmount = 500e6;
    maxSweep = toBN("500000", 18);
    sweepAmount = toBN("5000", 18);
    maxWeth = toBN("5000", 18);

    await sendEth(Const.WETH_HOLDER);
    // ------------- Deployment of contracts -------------
    factory = await ethers.getContractAt("IComposableStablePoolFactory", balancer.factory);
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, owner.address, 2500]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);

    Token = await ethers.getContractFactory("ERC20");
    usdc = await Token.attach(tokens.usdc);
    weth = await Token.attach(tokens.weth);

    Oracle = await ethers.getContractFactory("AggregatorMock");
    usdcOracle = await Oracle.deploy();

    AMM = await ethers.getContractFactory("BalancerAMM");
    amm = await AMM.deploy(
      sweep.address,
      usdc.address,
      chainlink.sequencer,
      usdcOracle.address,
      86400
    )

    WETHAsset = await ethers.getContractFactory("ERC20Asset");
    weth_asset = await WETHAsset.deploy(
      'WETH Asset',
      sweep.address,
      tokens.usdc,
      tokens.weth,
      usdcOracle.address,
      chainlink.weth_usd,
      BORROWER,
      uniswap.pool_weth
    );

    await weth_asset.configure(
      Const.RATIO, 500, maxSweep, Const.ZERO, Const.ZERO, Const.DAYS_5,
      Const.RATIO, maxSweep, Const.TRUE, Const.FALSE, Const.URL
    );
  });

  describe("invest and divest functions", async function () {
    it("setup", async function () {
      // create the pool
      data = getAddressAndProviders(sweep.address, usdc.address);

      const pool = await (await factory.create(
        "Balancer SWEEP-USDC StablePool",
        "SWEEP-USDC-BPT",
        data.tokens,
        500, // amplification
        data.providers, //rateProviders
        [0, 0], // tokenRateCacheDurations
        true, // exemptFromYieldProtocolFeeFlag
        1e14, // swapFeePercentage, 1e12 = 0.0001%
        '0xba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1b', // balancer governance
        '0x42616c616e6365722053574545502d5553444320537461626c65506f6f6c2031' // salt
      )).wait();

      poolAddress = pool.logs[0].address;
      balancerPool = await ethers.getContractAt("IBalancerPool", poolAddress);
      vaultAddress = await balancerPool.getVault();

      MarketMaker = await ethers.getContractFactory("BalancerMarketMaker");
      marketmaker = await MarketMaker.deploy(
        'Balancer Market Maker',
        sweep.address,
        usdc.address,
        usdcOracle.address,
        poolAddress,
        owner.address
      );

      await marketmaker.configure(0, 0, maxSweep, 0, 0, 0, 0, 0, false, false, Const.URL)
      
      await sweep.addMinter(marketmaker.address, maxSweep);
      await sweep.addMinter(weth_asset.address, maxSweep);
      await sweep.setAMM(amm.address);

      usdcAmount = 5500e6;
      sweepAmount = toBN("5000", 18);

      // deposit
      await sendEth(wallets.usdc_holder);
      user = await impersonate(wallets.usdc_holder);
      await usdc.connect(user).transfer(weth_asset.address, depositAmount);
      await usdc.connect(user).transfer(owner.address, usdcAmount);

      await usdc.transfer(marketmaker.address, usdcAmount);
      await marketmaker.borrow(sweepAmount);
      await marketmaker.initPool(usdcAmount, sweepAmount);

      await amm.setPool(poolAddress);
      await amm.setMarketMaker(marketmaker.address);
    })

    it("invest correctly", async function () {
      expect(await weth_asset.assetValue()).to.equal(Const.ZERO);
      expect(await usdc.balanceOf(weth_asset.address)).to.greaterThan(Const.ZERO);
      expect(await weth.balanceOf(weth_asset.address)).to.equal(Const.ZERO);

      borrowAmount = toBN("800", 18);
      await weth_asset.oneStepInvest(borrowAmount, 30000, true);
      balanceBefore = await weth.balanceOf(weth_asset.address);

      expect(balanceBefore).to.greaterThan(Const.ZERO);
      expect(await weth_asset.assetValue()).to.greaterThan(Const.ZERO);

      await weth_asset.invest(depositAmount, 30000);

      expect(await usdc.balanceOf(weth_asset.address)).to.equal(Const.ZERO);
      expect(await weth.balanceOf(weth_asset.address)).to.greaterThan(balanceBefore);
    });

    it("divest correctly", async function () {
      assetValue = await weth_asset.assetValue();
      currentValue = await weth_asset.currentValue();
      borrowed = await weth_asset.sweepBorrowed()
      expect(assetValue).to.equal(currentValue);

      expect(await usdc.balanceOf(weth_asset.address)).to.equal(0)
      expect(await sweep.balanceOf(weth_asset.address)).to.equal(0)
      expect(await weth.balanceOf(weth_asset.address)).to.greaterThan(0)

      await weth_asset.oneStepDivest(withdrawAmount, 5000, true);

      expect(await weth_asset.sweepBorrowed()).to.lessThan(borrowed)

      assetValue = await weth_asset.assetValue();
      balance = await usdc.balanceOf(weth_asset.address);

      await weth_asset.divest(withdrawAmount, 5000);

      expect(await usdc.balanceOf(weth_asset.address)).to.greaterThan(balance);
      expect(await weth.balanceOf(weth_asset.address)).to.equal(0)
      expect(await weth_asset.assetValue()).to.below(assetValue);
    });
  });
});

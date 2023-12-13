const { expect } = require("chai");
const { ethers } = require("hardhat");
const { chainlink, tokens, wallets, balancer } = require("../../utils/constants");
const { impersonate, sendEth, Const, toBN, getAddressAndProviders } = require("../../utils/helper_functions");
let user;

contract("Balancer Market Maker - mint factor", async function () {
  before(async () => {
    [owner, other, treasury, lzEndpoint] = await ethers.getSigners();

    BORROWER = owner.address;
    depositAmount = 100e6;
    withdrawAmount = 500e6;
    maxSweep = toBN("500000", 18);
    sweepAmount = toBN("5000", 18);
    maxWeth = toBN("5000", 18);
    // ------------- Deployment of contracts -------------
    factory = await ethers.getContractAt("IComposableStablePoolFactory", balancer.factory);
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, owner.address, 2500]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);

    Token = await ethers.getContractFactory("ERC20");
    usdc = await Token.attach(tokens.usdc);

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
  });

  describe("main functions", async function () {
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
      await sweep.setAMM(amm.address);

      usdcAmount = 5500e6;
      sweepAmount = toBN("5000", 18);

      // deposit
      await sendEth(wallets.usdc_holder);
      user = await impersonate(wallets.usdc_holder);
      await usdc.connect(user).transfer(owner.address, usdcAmount);
      await usdc.connect(user).transfer(other.address, usdcAmount);

      await usdc.approve(marketmaker.address, usdcAmount);
      await marketmaker.initPool(usdcAmount, sweepAmount);

      await amm.setPool(poolAddress);
      await amm.setMarketMaker(marketmaker.address);
      await marketmaker.setMintFactor(1e6);
    })

    it("buySweep on AMM and MM", async function () {
      sweepPrice = await sweep.ammPrice();
      buyPrice = await marketmaker.getBuyPrice();
      expect(buyPrice).to.greaterThan(sweepPrice);

      sweepBorrowed = await marketmaker.sweepBorrowed();
      vBalanceUSDC = await usdc.balanceOf(vaultAddress);
      vBalanceSWEEP = await sweep.balanceOf(vaultAddress);
      uBalanceUSDC = await usdc.balanceOf(other.address);
      uBalanceSWEEP = await sweep.balanceOf(other.address);

      amountIn = 1000e6;
      minOut = toBN("990", 18);
      await usdc.connect(other).approve(amm.address, amountIn);
      // swaps on Balancer Pool
      await amm.connect(other).buySweep(usdc.address, amountIn, minOut);

      sweepPrice = await sweep.ammPrice();
      buyPrice = await marketmaker.getBuyPrice();
      expect(buyPrice).to.lessThan(sweepPrice);
      expect(await marketmaker.sweepBorrowed()).to.equal(sweepBorrowed);
      expect(await usdc.balanceOf(vaultAddress)).to.greaterThan(vBalanceUSDC);
      expect(await sweep.balanceOf(vaultAddress)).to.lessThan(vBalanceSWEEP);
      expect(await usdc.balanceOf(other.address)).to.equal(uBalanceUSDC.sub(amountIn));
      expect(await sweep.balanceOf(other.address)).to.greaterThan(uBalanceSWEEP);

      // sets new mintFactor
      await marketmaker.setMintFactor(1e5) // 10% ~ 0.5% slippage
      sweepBorrowed = await marketmaker.sweepBorrowed();
      vBalanceUSDC = await usdc.balanceOf(vaultAddress);
      vBalanceSWEEP = await sweep.balanceOf(vaultAddress);
      uBalanceUSDC = await usdc.balanceOf(other.address);
      uBalanceSWEEP = await sweep.balanceOf(other.address);

      minOut = toBN("900", 18);
      await usdc.connect(other).approve(amm.address, amountIn);
      await amm.connect(other).buySweep(usdc.address, amountIn, minOut);

      expect(await marketmaker.sweepBorrowed()).to.greaterThan(sweepBorrowed);
      expect(await usdc.balanceOf(vaultAddress)).to.equal(vBalanceUSDC.add(amountIn));
      expect(await sweep.balanceOf(vaultAddress)).to.greaterThan(vBalanceSWEEP);
      expect(await usdc.balanceOf(other.address)).to.equal(uBalanceUSDC.sub(amountIn));
      expect(await sweep.balanceOf(other.address)).to.greaterThan(uBalanceSWEEP);

      // sets new mintFactor
      await marketmaker.setMintFactor(1e4) // 1% ~ 0.5% slippage
      sweepBorrowed = await marketmaker.sweepBorrowed();
      vBalanceUSDC = await usdc.balanceOf(vaultAddress);
      vBalanceSWEEP = await sweep.balanceOf(vaultAddress);
      uBalanceUSDC = await usdc.balanceOf(other.address);
      uBalanceSWEEP = await sweep.balanceOf(other.address);

      minOut = toBN("900", 18);
      await usdc.connect(other).approve(amm.address, amountIn);
      await amm.connect(other).buySweep(usdc.address, amountIn, minOut);

      expect(await marketmaker.sweepBorrowed()).to.greaterThan(sweepBorrowed);
      expect(await usdc.balanceOf(vaultAddress)).to.equal(vBalanceUSDC.add(amountIn));
      expect(await sweep.balanceOf(vaultAddress)).to.greaterThan(vBalanceSWEEP);
      expect(await usdc.balanceOf(other.address)).to.equal(uBalanceUSDC.sub(amountIn));
      expect(await sweep.balanceOf(other.address)).to.greaterThan(uBalanceSWEEP);
    });
  });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { wallets, chainlink, balancer } = require('../../utils/constants');
const { Const, toBN, getAddressAndProviders } = require("../../utils/helper_functions");
let poolAddress;

contract('Balancer Market Maker', async () => {
  before(async () => {
    [borrower, lzEndpoint, multisig, treasury] = await ethers.getSigners();

    BORROWER = borrower.address;
    SLIPPAGE = 1e4;

    sweepAmount = toBN("100000000000000", 18);
    usdcAmount = toBN("10000", 6);
    buyAmount = toBN("3000", 18);

    Sweep = await ethers.getContractFactory("SweepCoin");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, multisig.address, 2500]);
    sweep = await Proxy.deployed();

    await sweep.setTreasury(treasury.address);
    ERC20 = await ethers.getContractFactory("USDCMock");
    usdc = await ERC20.deploy(6);

    factory = await ethers.getContractAt("IComposableStablePoolFactory", balancer.factory);

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

    await sweep.setAMM(amm.address);
  });

  it('create the pool', async () => {
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

    expect(await balancerPool.getPoolId()).to.not.be.equal(0);
  });

  it('deploy and configure the Balancer MM', async () => {
    MarketMaker = await ethers.getContractFactory("BalancerMarketMaker");
    marketmaker = await MarketMaker.deploy(
      'Balancer Market Maker',
      sweep.address,
      usdc.address,
      usdcOracle.address,
      poolAddress,
      BORROWER
    );

    await marketmaker.configure(0, 0, sweepAmount, 0, 0, 0, 0, 0, false, false, Const.URL)
    await sweep.addMinter(marketmaker.address, sweepAmount);
    await amm.setMarketMaker(marketmaker.address);
  });

  it('Inits the pool correctly', async () => {
    await usdc.transfer(marketmaker.address, 2e6);
    await marketmaker.borrow(toBN("1", 18));

    await marketmaker.initPool(2e6, toBN("1", 18));
    await amm.setPool(poolAddress);

    expect(await amm.getPrice()).to.greaterThan(0);
    expect(await marketmaker.assetValue()).to.greaterThan(0);
    expect(await marketmaker.currentValue()).to.greaterThan(0);
    expect(await sweep.balanceOf(vaultAddress)).to.greaterThan(0);
  });

  it('Adds Liquidity correctly', async () => {
    usdcToAdd = toBN("2000", 6);
    sweepToAdd = toBN("1000", 18);

    sweepBefore = await sweep.balanceOf(vaultAddress);
    usdcBefore = await usdc.balanceOf(vaultAddress);

    await usdc.transfer(marketmaker.address, usdcToAdd);
    await marketmaker.borrow(sweepToAdd);
    await marketmaker.addLiquidity(usdcToAdd, sweepToAdd, SLIPPAGE);

    expect(await usdc.balanceOf(vaultAddress)).to.equal(usdcBefore.add(usdcToAdd));
    expect(await sweep.balanceOf(vaultAddress)).to.equal(sweepBefore.add(sweepToAdd));
  });

  it('Removes liquidity correctly', async () => {
    usdcToRemove = toBN("250", 6);
    sweepToRemove = toBN("250", 18);

    price = await sweep.ammPrice();
    sweepBefore = await sweep.balanceOf(vaultAddress);
    usdcBefore = await usdc.balanceOf(vaultAddress);

    await marketmaker.removeLiquidity(usdcToRemove, sweepToRemove, SLIPPAGE);
    expect(await sweep.balanceOf(vaultAddress)).to.equal(sweepBefore.sub(sweepToRemove));
    expect(await usdc.balanceOf(vaultAddress)).to.equal(usdcBefore.sub(usdcToRemove));
  });

  it('Increases liquidity by buying Sweep', async () => {
    usdxAmount = toBN("500", 6);
    sweepToGet = toBN("495", 18);
    sweepBefore = await sweep.balanceOf(borrower.address);
    usdcBefore = await usdc.balanceOf(borrower.address);
    vaultSweepBefore = await usdc.balanceOf(vaultAddress);
    vaultUsdcBefore = await usdc.balanceOf(vaultAddress);

    expect(sweepBefore).to.equal(0);
    await usdc.approve(marketmaker.address, usdxAmount);
    await marketmaker.buySweep(usdxAmount);

    expect(await usdc.balanceOf(borrower.address)).to.equal(usdcBefore.sub(usdxAmount));
    expect(await sweep.balanceOf(borrower.address)).to.be.greaterThan(sweepToGet);
    
    expect(await sweep.balanceOf(vaultAddress)).to.greaterThan(vaultSweepBefore);
    expect(await usdc.balanceOf(vaultAddress)).to.greaterThan(vaultUsdcBefore);
  });

  it('buys Sweep from the MM', async () => {
    price = await amm.getPrice();
    expect(await marketmaker.getBuyPrice()).to.lessThan(price);

    sweepBalanceB = await sweep.balanceOf(vaultAddress);
    usdcBalanceB = await usdc.balanceOf(vaultAddress);

    USDC_AMOUNT = toBN("950", 6);
    MIN_AMOUNT = toBN("850", 18);

    await usdc.approve(amm.address, USDC_AMOUNT);
    await amm.buySweep(usdc.address, USDC_AMOUNT, MIN_AMOUNT);

    expect(await sweep.balanceOf(vaultAddress)).to.greaterThan(sweepBalanceB)
    expect(await usdc.balanceOf(vaultAddress)).to.greaterThan(usdcBalanceB)
  });
});

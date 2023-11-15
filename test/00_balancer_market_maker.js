const { expect } = require("chai");
const { ethers } = require("hardhat");
const { tokens, wallets, chainlink, protocols } = require('../utils/constants');
const { Const, impersonate, toBN, sendEth } = require("../utils/helper_functions");
let poolAddress;

contract.only('Balancer Market Maker', async () => {
  before(async () => {
    [borrower] = await ethers.getSigners();

    USDC_ADDRESS = tokens.usdc;
    SWEEP_ADDRESS = tokens.sweep;
    HOLDER = wallets.usdc_holder;
    BORROWER = borrower.address;
    USDC_ORACLE = chainlink.usdc_usd;

    sweepAmount = toBN("100000000000000", 18);
    usdcAmount = toBN("10000", 6);
    buyAmount = toBN("3000", 18);

    sweep = await ethers.getContractAt("SweepCoin", SWEEP_ADDRESS);
    usdc = await ethers.getContractAt("ERC20", USDC_ADDRESS);
    factory = await ethers.getContractAt("IComposableStablePoolFactory", protocols.balancer_factory);

    AMM = await ethers.getContractFactory("BalancerAMM");
    amm = await AMM.deploy(
      SWEEP_ADDRESS,
      USDC_ADDRESS,
      chainlink.sequencer,
      chainlink.usdc_usd,
      86400
    )

    await sendEth(HOLDER);
    user = await impersonate(HOLDER);
    await usdc.connect(user).transfer(borrower.address, usdcAmount);

    // ----- Set isMintingAllowed: true
    BALANCER = await sweep.balancer();
    await sendEth(BALANCER);
    user = await impersonate(BALANCER);
    await sweep.connect(user).setTargetPrice(9e5, 9e5);

    SWEEP_OWNER = await sweep.owner();
    await sendEth(SWEEP_OWNER);
    user = await impersonate(SWEEP_OWNER);
    await sweep.connect(user).setAMM(amm.address);
  });

  const getAddressAndProviders = (sweep, token) => {
    data = {};

    if (token.toString().toLowerCase() < sweep.toString().toLowerCase()) {
      data.tokens = [token, sweep];
      data.providers = ['0x0000000000000000000000000000000000000000', amm.address];
    } else {
      data.tokens = [sweep, token];
      data.providers = [amm.address, '0x0000000000000000000000000000000000000000'];
    }

    return data;
  }

  it('create the pool', async () => {
    data = getAddressAndProviders(sweep.address, USDC_ADDRESS);

    const pool = await (await factory.create(
      "Balancer SWEEP-USDC Stable Pool",
      "SWEEP-USDC-BTP",
      data.tokens,
      500, // amplification
      data.providers, //rateProviders
      [10800, 10800], // tokenRateCacheDurations
      true, // exemptFromYieldProtocolFeeFlag
      1e14, // swapFeePercentage, 1e12 = 0.0001%
      '0xba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1b', // balancer governance
      '0x0000000000000000000000000000000000000000000000000000000000001234' // salt
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
      USDC_ADDRESS,
      USDC_ORACLE,
      poolAddress,
      BORROWER
    );

    await marketmaker.configure(0, 0, sweepAmount, 0, 0, 0, 0, 0, false, false, Const.URL)
    await sweep.connect(user).addMinter(marketmaker.address, sweepAmount);
  });

  it('Init the poool correctly', async () => {
    expect(await sweep.balanceOf(vaultAddress)).to.equal(0);

    await usdc.approve(marketmaker.address, usdcAmount);
    await marketmaker.initPool();
    await amm.connect(user).setPool(poolAddress);

    expect(await amm.getPrice()).to.greaterThan(0);
    expect(await marketmaker.assetValue()).to.greaterThan(0);
    expect(await marketmaker.currentValue()).to.greaterThan(0);

    expect(await sweep.balanceOf(vaultAddress)).to.greaterThan(0);
  });

  it('Adds Liquidity correctly', async () => {
    usdcToAdd = toBN("1000", 6);
    sweepToAdd = toBN("1000", 18);

    sweepBefore = await sweep.balanceOf(vaultAddress);
    usdcBefore = await usdc.balanceOf(vaultAddress);

    await usdc.transfer(marketmaker.address, usdcToAdd);
    await marketmaker.addLiquidity(usdcToAdd, sweepToAdd, 0);

    expect(await usdc.balanceOf(vaultAddress)).to.equal(usdcBefore.add(usdcToAdd));
    expect(await sweep.balanceOf(vaultAddress)).to.equal(sweepBefore.add(sweepToAdd));
  });

  it('Removes liquidity correctly', async () => {
    sweepToRemove = toBN("250", 18);
    usdcToRemove = toBN("250", 6);

    price = await sweep.ammPrice();
    sweepBefore = await sweep.balanceOf(vaultAddress);

    await marketmaker.removeLiquidity(0, sweepToRemove, 0);

    expect(await sweep.ammPrice()).to.greaterThan(price);
    expect(await sweep.balanceOf(vaultAddress)).to.equal(sweepBefore.sub(sweepToRemove));

    priceBefore = await sweep.ammPrice();
    usdcBefore = await usdc.balanceOf(vaultAddress);

    await marketmaker.removeLiquidity(usdcToRemove, 0, 0);

    expect(await sweep.ammPrice()).to.greaterThan(price);
    expect(await usdc.balanceOf(vaultAddress)).to.equal(usdcBefore.sub(usdcToRemove));
  });

  it('Increases liquidity by buying Sweep', async () => {
    user = await impersonate(BALANCER);
    await sweep.connect(user).setTargetPrice(1e6, 1e6);

    sweepToBuy = toBN("1000", 18);
    sweepBefore = await sweep.balanceOf(borrower.address);
    usdcBefore = await usdc.balanceOf(borrower.address);

    expect(sweepBefore).to.equal(0);

    await marketmaker.buySweep(sweepToBuy, 1e4);

    expect(await usdc.balanceOf(borrower.address)).to.lessThan(usdcBefore);
    expect(await sweep.balanceOf(borrower.address)).to.equal(sweepToBuy);
  });

  it('Swap with an old asset', async () => {

  });
});

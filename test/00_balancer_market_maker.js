const { expect } = require("chai");
const { ethers } = require("hardhat");
const { tokens, wallets, chainlink, protocols } = require('../utils/constants');
const { Const, impersonate, toBN, sendEth } = require("../utils/helper_functions");
let poolAddress;

contract.only('Balancer Market Maker', async () => {
  before(async () => {
    [owner, treasury, lzEndpoint] = await ethers.getSigners();

    USDC_ADDRESS = tokens.usdc;
    HOLDER = wallets.usdc_holder;
    OWNER = owner.address;
    USDC_ORACLE = chainlink.usdc_usd;

    sweepAmount = toBN("100000000000000", 18);
    usdcAmount = toBN("10000", 6);
    buyAmount = toBN("3000", 18);

    Sweep = await ethers.getContractFactory("SweepCoin");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, OWNER, 2500]);
    sweep = await Proxy.deployed();

    usdc = await ethers.getContractAt("ERC20", USDC_ADDRESS);
    factory = await ethers.getContractAt("IComposableStablePoolFactory", protocols.balancer_factory);

    AMM = await ethers.getContractFactory("BalancerAMM");
    amm = await AMM.deploy(
      sweep.address,
      USDC_ADDRESS,
      chainlink.sequencer,
      chainlink.usdc_usd,
      86400
    )

    await sweep.setAMM(amm.address);
    await sweep.setTreasury(treasury.address);
    
    await sendEth(HOLDER);
    user = await impersonate(HOLDER);
    await usdc.connect(user).transfer(owner.address, usdcAmount);
  });

  const getAddressAndProviders = (sweep, token) => {
    data = { };

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

    const pool = await( await factory.create(
      "Balancer SWEEP-USDC Stable Pool",
      "SWEEP-USDC-BTP",
      data.tokens,
      1, // amplification
      data.providers, //rateProviders
      [10800, 10800], // tokenRateCacheDurations
      true, // exemptFromYieldProtocolFeeFlag
      1e14, // swapFeePercentage, 1e12 = 0.0001%
      '0xba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1ba1b', // balancer governance
      '0x0000000000000000000000000000000000000000000000000000000000001234' // salt
    )).wait();

    poolAddress = pool.logs[0].address;
    balancerPool = await ethers.getContractAt("IBalancerPool", poolAddress);

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
      OWNER
    );

    // config market maker
    await marketmaker.configure(0, 0, sweepAmount, 0, 0, 0, 0, 0, false, false, Const.URL)
    await sweep.addMinter(marketmaker.address, sweepAmount);
  });

  it('Init the poool correctly', async () => {
    // expect(await marketmaker.assetValue()).to.be(0);
    // expect(await marketmaker.currenttValue()).to.be(0);

    await usdc.approve(marketmaker.address, usdcAmount);
    await marketmaker.initPool();

    console.log("price", await amm.getPrice())
    console.log("twa p", await amm.getTWAPrice())
    console.log("rate", await amm.getRate())

    console.log(await marketmaker.assetValue())
    console.log(await marketmaker.currenttValue())
    // await amm.setPool(poolAddress);
  });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { network, chainlink, trader_joe } = require("../../utils/constants");
const { toBN, impersonate, sendEth } = require("../../utils/helper_functions");

contract.only("Trader Joe AMM", async function () {
  if (Number(network.id) !== 43114) return;

  before(async () => {
    [owner, treasury, lzEndpoint, balancer] = await ethers.getSigners();
    BORROWER = owner.address;

    ERC20 = await ethers.getContractFactory("USDCMock");
    usdc = await ERC20.deploy(6);

    Sweep = await ethers.getContractFactory("SweepCoin");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, owner.address, 2500]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);

    Oracle = await ethers.getContractFactory("AggregatorMock");
    usdcOracle = await Oracle.deploy();

    Quoter = await ethers.getContractFactory("JoeQuoter");
    quoter = await Quoter.deploy();

    factory = await ethers.getContractAt("ILBFactory", trader_joe.factory);
  });

  describe("Main functions", async function () {
    it('set up ~ create the pool, deploy AMM & MM', async () => {
      FACTORY_OWNER = await factory.owner();
      await sendEth(FACTORY_OWNER);
      user = await impersonate(FACTORY_OWNER);
      await factory.connect(user).addQuoteAsset(usdc.address);

      ACTIVE_ID = 8377550;
      BIN_STEP = 25;

      await factory.createLBPair(sweep.address, usdc.address, ACTIVE_ID, BIN_STEP);
      POOL = await factory.connect(balancer).getLBPairInformation(sweep.address, usdc.address, BIN_STEP);
      poolAddress = POOL.LBPair;
      pool = await await ethers.getContractAt("ILBPair", poolAddress);

      AMM = await ethers.getContractFactory("TraderJoeAMM");
      amm = await AMM.deploy(
        sweep.address,
        usdc.address,
        chainlink.sequencer,
        usdcOracle.address,
        86400,
        trader_joe.router,
        poolAddress,
        quoter.address
      );

      MarketMaker = await ethers.getContractFactory("TraderJoeMarketMaker");
      marketmaker = await MarketMaker.deploy(
        'Trader Joe Market Maker',
        sweep.address,
        usdc.address,
        usdcOracle.address,
        poolAddress,
        trader_joe.router,
        BORROWER
      );

      sweepAmount = toBN("10000000", 18); // 10M
      await sweep.addMinter(BORROWER, sweepAmount.mul(5));
      await sweep.addMinter(marketmaker.address, sweepAmount);

      // config market maker
      await marketmaker.configure(2000, 0, sweepAmount, 0, 0, 0, 0, 0, false, false, '');
      await marketmaker.setAMM(amm.address);
      await sweep.setAMM(amm.address);
      // adds liquidity
      sweepAmount = toBN("10000", 18);
      usdcAmount = toBN("10000", 6);
      await usdc.transfer(marketmaker.address, usdcAmount.mul(2));
      await marketmaker.borrow(sweepAmount);
      await marketmaker.lpTrade(usdcAmount, sweepAmount, 1000);
    });

    it("BuySweep ->> fails with bad rates", async function () {
      USDC_AMOUNT = toBN("1000", 6);
      SWEEP_AMOUNT = toBN("200", 18);
      await usdc.approve(amm.address, USDC_AMOUNT);
      await expect(amm.buySweep(usdc.address, USDC_AMOUNT, SWEEP_AMOUNT))
					.to.be.revertedWithCustomError(amm, "BadRate");
    });
    
    it("buys correctly", async function () {
      sweepBefore = await sweep.balanceOf(BORROWER);
      usdcBefore = await usdc.balanceOf(BORROWER);

      USDC_AMOUNT = toBN("1000", 6);
      SWEEP_AMOUNT = toBN("900", 18);

      await usdc.approve(amm.address, USDC_AMOUNT);
      await amm.buySweep(usdc.address, USDC_AMOUNT, SWEEP_AMOUNT);

      sweepAfter = await sweep.balanceOf(BORROWER);
      usdcAfter = await usdc.balanceOf(BORROWER);

      expect(usdcAfter.add(USDC_AMOUNT)).to.be.equal(usdcBefore);
      expect(sweepAfter).to.be.above(sweepBefore);
    });

    it("SellSweep ->> fails with bad rates", async function () {
      sweepBefore = await sweep.balanceOf(BORROWER);
      usdcBefore = await usdc.balanceOf(BORROWER);

      USDC_AMOUNT = toBN("100", 6);
      SWEEP_AMOUNT = toBN("900", 18);

      await sweep.approve(amm.address, SWEEP_AMOUNT);
      await expect(amm.sellSweep(usdc.address, SWEEP_AMOUNT, USDC_AMOUNT))
				.to.be.revertedWithCustomError(amm, "BadRate");
    });

    it("sells correctly", async function () {
      sweepBefore = await sweep.balanceOf(BORROWER);
      usdcBefore = await usdc.balanceOf(BORROWER);

      USDC_AMOUNT = toBN("800", 6);
      SWEEP_AMOUNT = toBN("900", 18);

      await sweep.approve(amm.address, SWEEP_AMOUNT);
      await amm.sellSweep(usdc.address, SWEEP_AMOUNT, USDC_AMOUNT);

      sweepAfter = await sweep.balanceOf(BORROWER);
      usdcAfter = await usdc.balanceOf(BORROWER);

      expect(sweepAfter.add(SWEEP_AMOUNT)).to.be.equal(sweepBefore);
      expect(usdcAfter).to.be.above(usdcBefore);
    });
  });
});

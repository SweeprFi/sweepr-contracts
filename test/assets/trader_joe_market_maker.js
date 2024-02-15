const { expect } = require("chai");
const { ethers } = require("hardhat");
const { network, trader_joe, chainlink } = require("../../utils/constants");
const { toBN, impersonate, sendEth } = require("../../utils/helper_functions");
let poolAddress;

contract.only('Trader Joe Market Maker', async () => {
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

  describe("main functions", async function () {
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
    });

    it('adds Liquidity', async () => {
      expect(await sweep.isMintingAllowed()).to.equal(true);
      expect(await marketmaker.tradePosition()).to.equal(0);
      expect(await marketmaker.assetValue()).to.equal(0);
      expect(await sweep.balanceOf(poolAddress)).to.equal(0);
      expect(await usdc.balanceOf(poolAddress)).to.equal(0);

      sweepAmount = toBN("10000", 18);
      usdcAmount = toBN("10000", 6);
      await usdc.transfer(marketmaker.address, usdcAmount.mul(2));
      await marketmaker.borrow(sweepAmount);
      await marketmaker.lpTrade(usdcAmount, sweepAmount, 1000);

      tradePositionID = await marketmaker.tradePosition();
      assetValue = await marketmaker.assetValue();
      expect(tradePositionID).to.not.equal(0);
      expect(await sweep.balanceOf(poolAddress)).to.equal(sweepAmount);
      expect(await usdc.balanceOf(poolAddress)).to.equal(usdcAmount);
      
      sweepAmount = toBN("5000", 18);
      await marketmaker.borrow(sweepAmount);
      sweepAmount = toBN("15000", 18);
      usdcAmount = toBN("15000", 6);
      await marketmaker.lpTrade(usdcAmount, sweepAmount, 1000);

      expect(tradePositionID).to.not.equal(0);
      expect(await sweep.balanceOf(poolAddress)).to.equal(sweepAmount);
      expect(await usdc.balanceOf(poolAddress)).to.equal(usdcAmount);
      expect(await marketmaker.assetValue()).to.greaterThan(assetValue);
    })

    it('buy Sweep on AMM', async () => {      
      expect(await sweep.balanceOf(marketmaker.address)).to.equal(0);
      usdxAmount = toBN("1000", 6);
      await marketmaker.buySweepOnAMM(usdxAmount, 30000);
      expect(await sweep.balanceOf(marketmaker.address)).to.greaterThan(0);
    })

    it('buys sweep from MM directly', async () => {
      assetValue = await marketmaker.assetValue();

      amount = toBN("2000", 6);
      await usdc.approve(marketmaker.address, amount);
      await marketmaker.buySweep(amount);

      expect(await marketmaker.assetValue()).to.greaterThan(assetValue);
    })

    it('adds single sided liquidty for USDx correctly', async () => {
      assetValue = await marketmaker.assetValue();
      expect(await marketmaker.redeemPosition()).to.equal(0);

      usdcAmount = toBN("5000", 6);
      await usdc.transfer(marketmaker.address, usdcAmount);
      await marketmaker.lpRedeem(usdcAmount, 10000);

      expect(await marketmaker.assetValue()).to.greaterThan(assetValue);
      expect(await marketmaker.redeemPosition()).to.not.equal(0);
    })

    it('adds single side liquidity for SWEEP correctly', async () => {
      assetValue = await marketmaker.assetValue();
      expect(await marketmaker.growPosition()).to.equal(0);

      sweepAmount = toBN("7000", 18);
      await marketmaker.borrow(sweepAmount);
      await marketmaker.lpGrow(sweepAmount, 10000);

      expect(await marketmaker.assetValue()).to.greaterThan(assetValue);
      expect(await marketmaker.growPosition()).to.not.equal(0);
    })

    it('removes all position correctly', async () => {
      initValue = await marketmaker.assetValue();

      await marketmaker.removeGrowPosition();
      afterGrow = await marketmaker.assetValue();
      expect(await marketmaker.growPosition()).to.equal(0);
      expect(afterGrow).to.lessThan(initValue);

      await marketmaker.removeRedeemPosition();
      afterRedeem = await marketmaker.assetValue();
      expect(await marketmaker.redeemPosition()).to.equal(0);
      expect(afterRedeem).to.lessThan(afterGrow);

      await marketmaker.removeTradePosition();
      afterTrade = await marketmaker.assetValue();
      expect(await marketmaker.tradePosition()).to.equal(0);
      expect(afterTrade).to.lessThan(afterRedeem);
    })
  })
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { chainlink, tokens, deployments, wallets } = require("../../utils/constants");
const { toBN, increaseTime, impersonate, sendEth } = require("../../utils/helper_functions");

contract("Balancer AMM", async function () {
  before(async () => {
    [owner] = await ethers.getSigners();

    OWNER = owner.address;
    USDC_AMOUNT = 100e6;
    SWEEP_AMOUNT = toBN("98", 18);

    // ------------- Deployment of contracts -------------
    sweep = await ethers.getContractAt("SweepCoin", tokens.sweep);
    usdc = await ethers.getContractAt("IERC20", tokens.usdc);

    BalancerAMM = await ethers.getContractFactory("BalancerAMM");
    amm = await BalancerAMM.deploy(
      tokens.sweep,
      tokens.usdc,
      chainlink.sequencer,
      chainlink.usdc_usd,
      86400,
    );

    const multisig = await impersonate(wallets.multisig);
    await sweep.connect(multisig).setAMM(amm.address);
    await amm.connect(multisig).setPool(deployments.balancer_pool);

    await sendEth(wallets.usdc_holder);
    const usdHolder = await impersonate(wallets.usdc_holder);
    await usdc.connect(usdHolder).transfer(OWNER, USDC_AMOUNT);
  });

  describe("Buy Sweep", async function () {
    it("fails with bad rates", async function () {
      sweepBefore = await sweep.balanceOf(OWNER);
      usdcBefore = await usdc.balanceOf(OWNER);

      await usdc.approve(amm.address, USDC_AMOUNT);
      
      await expect(amm.buySweep(usdc.address, USDC_AMOUNT, toBN("20", 18)))
					.to.be.revertedWithCustomError(amm, "BadRate");
    });
    
    it("buys correctly", async function () {
      sweepBefore = await sweep.balanceOf(OWNER);
      usdcBefore = await usdc.balanceOf(OWNER);

      await usdc.approve(amm.address, USDC_AMOUNT);
      await amm.buySweep(usdc.address, USDC_AMOUNT, SWEEP_AMOUNT);

      sweepAfter = await sweep.balanceOf(OWNER);
      usdcAfter = await usdc.balanceOf(OWNER);

      expect(usdcAfter.add(USDC_AMOUNT)).to.be.equal(usdcBefore);
      expect(sweepAfter).to.be.above(sweepBefore);
    });
  });

  describe("Sell Sweep", async function () {
    it("fails with bad rates", async function () {
      sweepBefore = await sweep.balanceOf(OWNER);
      usdcBefore = await usdc.balanceOf(OWNER);

      await sweep.approve(amm.address, SWEEP_AMOUNT);

      await expect(amm.sellSweep(usdc.address, SWEEP_AMOUNT, 20e6))
				.to.be.revertedWithCustomError(amm, "BadRate");
    });
    
    it("sells correctly", async function () {
      sweepBefore = await sweep.balanceOf(OWNER);
      usdcBefore = await usdc.balanceOf(OWNER);

      await sweep.approve(amm.address, SWEEP_AMOUNT);
      await amm.sellSweep(usdc.address, SWEEP_AMOUNT, 85e6);

      sweepAfter = await sweep.balanceOf(OWNER);
      usdcAfter = await usdc.balanceOf(OWNER);

      expect(sweepAfter.add(SWEEP_AMOUNT)).to.be.equal(sweepBefore);
      expect(usdcAfter).to.be.above(usdcBefore);
    });
  });

  describe.skip('fetches Sweep price correctly', async () => {
    await increaseTime(86400); // 1 day
    price = await amm.getPrice();
    twaPrice = await amm.getTWAPrice();
    expect(price).to.eq(twaPrice);
  });
});

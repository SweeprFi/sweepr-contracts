const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { impersonate, toBN, Const } = require("../utils/helper_functions");
let user;

contract.skip("Uniswap AMM", async function () {
  before(async () => {
    OWNER = addresses.owner;
    USDC_AMOUNT = 100e6;
    SWEEP_AMOUNT = toBN("80", 18);
    // ------------- Deployment of contracts -------------
    Token = await ethers.getContractFactory("ERC20");
    usdc = await Token.attach(addresses.usdc);

    Sweep = await ethers.getContractFactory("SweepCoin");
    sweep = await Sweep.attach(addresses.sweep);

    UniswapAMM = await ethers.getContractFactory("UniswapAMM");
    amm = await UniswapAMM.deploy(
      addresses.sweep,
      addresses.sequencer_feed,
      3000, // TODO: create 500 pool and use Const.FEE
      addresses.usdc,
      addresses.oracle_usdc_usd,
      86400 // oracle update frequency ~ 1 day
    );

    user = await impersonate(addresses.usdc);
    await usdc.connect(user).transfer(OWNER, USDC_AMOUNT)
  });

  describe("main functions", async function() {
    it("buys 5 sweep correctly", async function() {
        user = await impersonate(OWNER);
        sweepBefore = await sweep.balanceOf(OWNER);
        usdcBefore = await usdc.balanceOf(OWNER);

        await usdc.connect(user).approve(amm.address, USDC_AMOUNT);
        await amm.connect(user).buySweep(usdc.address, USDC_AMOUNT, Const.ZERO);

        sweepAfter = await sweep.balanceOf(OWNER);
        usdcAfter = await usdc.balanceOf(OWNER);

        expect(usdcAfter.add(USDC_AMOUNT)).to.be.equal(usdcBefore);
        expect(sweepAfter).to.be.above(sweepBefore);
    });

    it("sells 2 sweep correctly", async function() {
        sweepBefore = await sweep.balanceOf(OWNER);
        usdcBefore = await usdc.balanceOf(OWNER);

        await sweep.connect(user).approve(amm.address, SWEEP_AMOUNT);
        await amm.connect(user).sellSweep(usdc.address, SWEEP_AMOUNT, Const.ZERO);

        sweepAfter = await sweep.balanceOf(OWNER);
        usdcAfter = await usdc.balanceOf(OWNER);

        expect(sweepAfter.add(SWEEP_AMOUNT)).to.be.equal(sweepBefore);
        expect(usdcAfter).to.be.above(usdcBefore);
    });
  });
});

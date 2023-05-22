const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { impersonate, toBN, Const } = require("../utils/helper_functions");
let user;

contract("Uniswap AMM", async function () {
  before(async () => {
    OWNER = addresses.owner;
    USDC_ADDRESS = addresses.usdc;
    USDC_AMOUNT = 100e6;
    SWEEP_AMOUNT = toBN("80", 18);
    // ------------- Deployment of contracts -------------
    Token = await ethers.getContractFactory("ERC20");
    usdc = await Token.attach(USDC_ADDRESS);

    Sweep = await ethers.getContractFactory("SweepDollarCoin");
    sweep = await Sweep.attach(addresses.sweep);

    UniswapAMM = await ethers.getContractFactory("UniswapAMM");
    amm = await UniswapAMM.deploy(addresses.sweep, Const.FEE, addresses.oracle_usdc_usd, addresses.sequencer_feed);

    user = await impersonate(USDC_ADDRESS);
    await usdc.connect(user).transfer(OWNER, USDC_AMOUNT)
  });

  describe("main functions", async function() {
    it("sets a new pool fee correctly", async function() {
        expect(await amm.poolFee()).to.be.equal(Const.FEE);

        await expect(amm.setPoolFee(Const.NEW_FEE))
            .to.be.revertedWithCustomError(UniswapAMM, 'NotGovernance');

        user = await impersonate(sweep_owner);
        await amm.connect(user).setPoolFee(Const.NEW_FEE);

        expect(await amm.poolFee()).to.be.equal(Const.NEW_FEE);
    });

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

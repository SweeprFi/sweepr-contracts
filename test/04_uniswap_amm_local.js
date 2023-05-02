const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { impersonate } = require("../utils/helper_functions");
let user;

contract("Uniswap AMM - Local", async function () {
  before(async () => {
    OWNER = addresses.owner;
    USDC_ADDRESS = addresses.usdc;
    USDC_AMOUNT = 100e6;
    FEE = 500;
    NEW_FEE = 3000;
    SWEEP_AMOUNT = ethers.utils.parseUnits("80", 18);
    // ------------- Deployment of contracts -------------
    Token = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
    usdc = await Token.attach(USDC_ADDRESS);

    Sweep = await ethers.getContractFactory("SweepDollarCoin");
    sweep = await Sweep.attach(addresses.sweep);

    UniswapAMM = await ethers.getContractFactory("UniswapAMM");
    amm = await UniswapAMM.deploy(addresses.sweep, FEE);

    user = await impersonate(USDC_ADDRESS);
    await usdc.connect(user).transfer(OWNER, USDC_AMOUNT)
  });

  describe("main functions", async function() {
    it("sets a new pool fee correctly", async function() {
        expect(await amm.poolFee()).to.be.equal(FEE);

        await expect(amm.setPoolFee(NEW_FEE))
            .to.be.revertedWithCustomError(UniswapAMM, 'OnlyAdmin');

        user = await impersonate(sweep_owner);
        await amm.connect(user).setPoolFee(NEW_FEE);

        expect(await amm.poolFee()).to.be.equal(NEW_FEE);
    });

    it("buys 5 sweep correctly", async function() {
        user = await impersonate(OWNER);
        sweepBefore = await sweep.balanceOf(OWNER);
        usdcBefore = await usdc.balanceOf(OWNER);

        await usdc.connect(user).approve(amm.address, USDC_AMOUNT);
        await amm.connect(user).buySweep(usdc.address, USDC_AMOUNT, 0);

        sweepAfter = await sweep.balanceOf(OWNER);
        usdcAfter = await usdc.balanceOf(OWNER);

        expect(usdcAfter.add(USDC_AMOUNT)).to.be.equal(usdcBefore);
        expect(sweepAfter).to.be.above(sweepBefore);
    });

    it("sells 2 sweep correctly", async function() {
        sweepBefore = await sweep.balanceOf(OWNER);
        usdcBefore = await usdc.balanceOf(OWNER);

        await sweep.connect(user).approve(amm.address, SWEEP_AMOUNT);
        await amm.connect(user).sellSweep(usdc.address, SWEEP_AMOUNT, 0);

        sweepAfter = await sweep.balanceOf(OWNER);
        usdcAfter = await usdc.balanceOf(OWNER);

        expect(sweepAfter.add(SWEEP_AMOUNT)).to.be.equal(sweepBefore);
        expect(usdcAfter).to.be.above(usdcBefore);
    });
  });
});

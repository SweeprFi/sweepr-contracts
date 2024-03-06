const { ethers } = require('hardhat');
const { expect } = require("chai");
const { network, tokens, wallets } = require("../../../utils/constants");
const { impersonate, sendEth, increaseTime } = require("../../../utils/helper_functions");

contract('Ethena Asset', async () => {
  if (Number(network.id) !== 1) return;

  before(async () => {
    [owner, lzEndpoint] = await ethers.getSigners();

    BORROWER = owner.address;
    HOLDER = wallets.usdc_holder;
    ADMIN = "0x3b0aaf6e6fcd4a7ceef8c92c32dfea9e64dc1862";

    depositAmount = 10000e6;
    investAmount = 6000e6;
    divestAmount = 7000e6;
    redeemAmount = 2000e6;
    SLIPPAGE = 1000;

    sweep = await ethers.getContractAt("SweepCoin", tokens.sweep);
    usdx = await ethers.getContractAt("ERC20", tokens.usdc);
    susde = await ethers.getContractAt("ISUSDe", tokens.susde);

    Oracle = await ethers.getContractFactory("AggregatorMock");
    usdcOracle = await Oracle.deploy();

    Asset = await ethers.getContractFactory("EthenaAsset");
    asset = await Asset.deploy(
      "Ethena Asset",
      tokens.sweep,
      tokens.usdc,
      tokens.usde,
      tokens.susde,
      usdcOracle.address,
      "0x02950460E2b9529D0E00284A5fA2d7bDF3fA4d72", // Curve ~ pool
      BORROWER
    );

    ASSET = asset.address;
    user = await impersonate(HOLDER);
    await sendEth(HOLDER);
    await usdx.connect(user).transfer(asset.address, depositAmount);
  });

  describe("Main test", async function () {
    it("invests correctly ~ Swap USDC ->> USDe and stake", async function () {
      assetValue = await asset.assetValue();

      await expect(asset.invest(0, SLIPPAGE))
        .to.be.revertedWithCustomError(asset, 'OverZero');

      expect(assetValue).to.equal(0);
      expect(await asset.currentValue()).to.equal(depositAmount);
      expect(await usdx.balanceOf(ASSET)).to.equal(depositAmount);

      await asset.invest(investAmount, SLIPPAGE);

      expect(await asset.assetValue()).to.greaterThan(0);
      expect(await usdx.balanceOf(ASSET)).to.equal(depositAmount - investAmount);

      await asset.invest(investAmount, SLIPPAGE);

      expect(await asset.assetValue()).to.greaterThan(0);
      expect(await usdx.balanceOf(ASSET)).to.equal(0);
      expect(await susde.balanceOf(ASSET)).to.greaterThan(0);
    });

    it("divests correctly ~ Unstake and swap USDe ->> USDC", async function () {
      assetValue = await asset.assetValue();
      await expect(asset.invest(investAmount, SLIPPAGE))
        .to.be.revertedWithCustomError(asset, 'NotEnoughBalance');

      await expect(asset.divest(0, SLIPPAGE))
        .to.be.revertedWithCustomError(asset, 'OverZero');

      await asset.requestRedeem(divestAmount);
      await increaseTime(60*60*24*7);
      await asset.divest(divestAmount, SLIPPAGE);

      expect(await asset.assetValue()).to.lessThan(assetValue);
      expect(await usdx.balanceOf(ASSET)).to.greaterThan(0);

      await expect(asset.divest(divestAmount, SLIPPAGE))
        .to.be.revertedWithCustomError(asset, 'OperationNotAllowed');

      await asset.requestRedeem(divestAmount);
      await expect(asset.divest(divestAmount, SLIPPAGE))
        .to.be.revertedWithCustomError(asset, 'OperationNotAllowed');

      await increaseTime(60*60*24*7);
      await asset.divest(divestAmount, SLIPPAGE);
      
      expect(await asset.assetValue()).to.equal(0);
      expect(await susde.balanceOf(ASSET)).to.equal(0);
    });

    it("divests correctly when cooldown duration = 0", async function () {
      await asset.invest(investAmount, SLIPPAGE);
      expect(await asset.assetValue()).to.greaterThan(0);
      expect(await susde.balanceOf(ASSET)).to.greaterThan(0);
      balance = await usdx.balanceOf(ASSET);

      await asset.requestRedeem(redeemAmount);
      resp = await susde.cooldowns(ASSET);

      expect(resp.cooldownEnd).to.greaterThan(0);
      expect(resp.underlyingAmount).to.greaterThan(0);
      expect(await susde.cooldownDuration()).to.greaterThan(0);

      user = await impersonate(ADMIN);
      await sendEth(ADMIN);
      await susde.connect(user).setCooldownDuration(0);
      expect(await susde.cooldownDuration()).to.equal(0);

      await asset.divest(divestAmount, SLIPPAGE);

      expect(await usdx.balanceOf(ASSET)).to.greaterThan(balance);
      expect(await asset.assetValue()).to.equal(0);
      expect(await susde.balanceOf(ASSET)).to.equal(0);
    })
  });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { network, wallets, tokens, yield_yak } = require("../../../utils/constants");
const { impersonate, sendEth, increaseTime } = require("../../../utils/helper_functions");

contract.only("Yield Yak Asset", async function () {
  if (Number(network.id) !== 43114) return;

  before(async () => {
    [borrower, treasury, lzEndpoint] = await ethers.getSigners();

    BORROWER = borrower.address;
    HOLDER = wallets.usdc_holder;
    depositAmount = 10000e6;
    investAmount = 6000e6;
    divestAmount = 7000e6;

    // ------------- Deployment of contracts -------------
    Token = await ethers.getContractFactory("ERC20");
    usdc = await Token.attach(tokens.usdc);

    Oracle = await ethers.getContractFactory("AggregatorMock");
    usdcOracle = await Oracle.deploy();

    strategy = await ethers.getContractAt("IYieldYakStrategy", yield_yak.usdc_startegy);

    YieldYakAsset = await ethers.getContractFactory("YieldYakAsset");
    asset = await YieldYakAsset.deploy(
      'Yield Yak Asset',
      tokens.sweep,
      usdc.address,
      usdcOracle.address,
      yield_yak.usdc_startegy,
      BORROWER
    );

    ASSET = asset.address

    await sendEth(HOLDER);
    user = await impersonate(HOLDER);
    await usdc.connect(user).transfer(ASSET, depositAmount);
  });

  describe("main functions", async function () {
    it("invests into Yield Yak correctly", async function () {
      assetValue = await asset.assetValue();

      await expect(asset.invest(0))
        .to.be.revertedWithCustomError(asset, 'OverZero');

      expect(assetValue).to.equal(0);
      expect(await asset.currentValue()).to.equal(depositAmount);
      expect(await usdc.balanceOf(asset.address)).to.equal(depositAmount);

      await asset.invest(investAmount);

      expect(await asset.assetValue()).to.greaterThan(0);
      expect(await usdc.balanceOf(asset.address)).to.equal(depositAmount - investAmount);

      await asset.invest(investAmount);

      expect(await asset.assetValue()).to.greaterThan(depositAmount);
      expect(await asset.currentValue()).to.greaterThan(depositAmount);
      expect(await usdc.balanceOf(asset.address)).to.equal(0);
    });

    it("divests from Yield Yak correctly", async function () {
      assetValue = await asset.assetValue();
      await expect(asset.invest(investAmount))
        .to.be.revertedWithCustomError(asset, 'NotEnoughBalance');
      await expect(asset.divest(0))
        .to.be.revertedWithCustomError(asset, 'OverZero');
      
      await increaseTime(365*60*60*24); // one year
      await asset.divest(divestAmount);
      
      expect(await asset.assetValue()).to.lessThan(assetValue);
      expect(await usdc.balanceOf(asset.address)).to.greaterThan(0);

      await asset.divest(divestAmount);
      
      expect(await asset.assetValue()).to.equal(0);
      expect(await usdc.balanceOf(asset.address)).to.greaterThan(depositAmount);
    });
  });
});

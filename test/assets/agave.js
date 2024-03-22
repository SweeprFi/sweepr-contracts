const { expect } = require("chai");
const { ethers } = require("hardhat");
const { network, wallets, tokens, chainlink, protocols } = require("../../utils/constants");
const { impersonate, sendEth, toBN, increaseTime } = require("../../utils/helper_functions");

contract.only("Agave Asset", async function () {
  if (Number(network.id) !== 100) return;

  before(async () => {
    [borrower, treasury] = await ethers.getSigners();
    BORROWER = borrower.address;
    HOLDER = wallets.holder;
    POOL = protocols.agave.pool;
    AMOUNT = toBN("10000", 18);

    Sweep = await ethers.getContractFactory("SweepCoin");
    const Proxy = await upgrades.deployProxy(Sweep, [treasury.address, BORROWER, 2500]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);

    wxdai = await ethers.getContractAt("ERC20", tokens.wxdai);
    atoken = await ethers.getContractAt("ERC20", tokens.agwxdai);

    Asset = await ethers.getContractFactory("AgaveAsset");
    asset = await Asset.deploy(
      'Agave Asset',
      sweep.address,
      tokens.wxdai,
      tokens.agwxdai,
      POOL,
      chainlink.xdai_usd,
      BORROWER
    );
    ASSET = asset.address;

    await sendEth(HOLDER);
    holder = await impersonate(HOLDER);
    await wxdai.connect(holder).transfer(ASSET, AMOUNT);
  });

  describe("main functions", async function () {
    it("invests into agave correctly", async function () {
      expect(await asset.assetValue()).to.equal(0);
      expect(await wxdai.balanceOf(ASSET)).to.equal(AMOUNT);

      investAmount = toBN("6000", 18);
      await asset.invest(investAmount);
      expect(await asset.assetValue()).to.greaterThan(0);

      await asset.invest(investAmount);
      current = await asset.currentValue();
      expect(await asset.assetValue()).to.equal(current);
    });

    it("divests from agave correctly", async function () {
      assetValue = await asset.assetValue();
      await increaseTime(60*60*24*365);
      expect(await asset.currentValue()).to.be.greaterThan(assetValue);
      expect(await wxdai.balanceOf(ASSET)).to.equal(0);

      assetValue = await asset.assetValue();
      divestAmount = toBN("6000", 18);

      await asset.divest(divestAmount);
      expect(await asset.assetValue()).to.be.lessThan(assetValue);

      divestAmount = toBN("6000", 18);
      await asset.divest(divestAmount);
      expect(await asset.assetValue()).to.equal(0);
    });
  });
});

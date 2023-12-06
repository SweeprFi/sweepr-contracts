const { ethers } = require('hardhat');
const { expect } = require("chai");
const { tokens, chainlink, uniswap, wallets } = require("../../utils/constants");
const { impersonate, toBN, sendEth, Const } = require("../../utils/helper_functions");

contract('Stabilizer - Minimum equity ratio', async () => {
  before(async () => {
    [owner, liquidator, guest, treasury, lzEndpoint] = await ethers.getSigners();
    // Variables
    usdxAmount = 1000e6;
    depositAmount = 10e6;
    mintAmount = toBN("90", 18);
    maxBorrow = toBN("100", 18);
    sweepAmount = toBN("1000", 18);
    mintingAmount = toBN("3000", 18);

    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, owner.address, 2500]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);

    ERC20 = await ethers.getContractFactory("ERC20");
    usdx = await ERC20.attach(tokens.usdc);
    weth = await ERC20.attach(tokens.weth);

    Uniswap = await ethers.getContractFactory("UniswapMock");
    uniswap_amm = await Uniswap.deploy(sweep.address, owner.address);
    await sweep.setAMM(uniswap_amm.address);

    WETHAsset = await ethers.getContractFactory("ERC20Asset");
    asset = await WETHAsset.deploy(
      'WETH Asset',
      sweep.address,
      tokens.usdc,
      tokens.weth,
      chainlink.usdc_usd,
      chainlink.weth_usd,
      owner.address,
      uniswap.pool_weth
    );

    // add asset as a minter
    await sweep.addMinter(asset.address, sweepAmount);
    await sweep.addMinter(owner.address, mintingAmount);
    await sweep.mint(mintingAmount);

    // mint sweep for the liquidator
    // simulates a pool in uniswap with 10000 SWEEP/USDX
    await sweep.transfer(liquidator.address, sweepAmount);
    await sweep.transfer(uniswap_amm.address, sweepAmount);

    user = await impersonate(wallets.usdc_holder);
    await sendEth(user.address);
    await usdx.connect(user).transfer(uniswap_amm.address, usdxAmount);
    await usdx.connect(user).transfer(owner.address, usdxAmount);

    // config stabilizer
    await asset.configure(
      0,
      Const.spreadFee,
      maxBorrow,
      Const.ZERO,
      Const.DAYS_5,
      Const.RATIO,
      mintAmount,
      Const.ZERO,
      Const.TRUE,
      Const.FALSE,
      Const.URL
    );

    await sweep.approve(asset.address, sweepAmount);
    await sweep.connect(liquidator).approve(asset.address, sweepAmount);
  });

  describe("Initial Test", async function () {
    it('deposit usdc to the asset', async () => {
      await usdx.transfer(asset.address, depositAmount);
      expect(await usdx.balanceOf(asset.address)).to.equal(depositAmount);
    });

    it('withdraw deposited before mint', async () => {
      expect(await asset.currentValue()).to.above(Const.ZERO);
      await asset.withdraw(usdx.address, depositAmount);
      expect(await asset.currentValue()).to.equal(Const.ZERO);
      await usdx.transfer(asset.address, depositAmount);
    });

    it('mint and sell sweep', async () => {
      await expect(asset.connect(guest).borrow(mintAmount))
        .to.be.revertedWithCustomError(asset, 'NotBorrower');
      await asset.borrow(mintAmount);
      expect(await asset.sweepBorrowed()).to.equal(mintAmount);

      await asset.sellSweepOnAMM(mintAmount, 0);
      expect(await sweep.balanceOf(asset.address)).to.equal(Const.ZERO);
      expect(await usdx.balanceOf(asset.address)).to.above(depositAmount);
    });

    it('try to withdraw more than is permitted', async () => {
      balance = await usdx.balanceOf(asset.address);
      withdrawAmount1 = balance; // 100 %
      withdrawAmount2 = depositAmount + 10000;

      await expect(asset.withdraw(usdx.address, withdrawAmount1))
        .to.be.revertedWithCustomError(asset, "EquityRatioExcessed");

      await expect(asset.withdraw(usdx.address, withdrawAmount2))
        .to.be.revertedWithCustomError(asset, "EquityRatioExcessed");
    });

    it('withdraw permitted amount', async () => {
      withdrawAmount = 9900000;
      currentValue = await asset.currentValue();

      await asset.withdraw(usdx.address, withdrawAmount);
      expect(await asset.currentValue()).to.below(currentValue);
    });
  })
});


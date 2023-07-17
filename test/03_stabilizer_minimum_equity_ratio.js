const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses } = require("../utils/address");
const { impersonate, toBN, Const } = require("../utils/helper_functions");

contract('Stabilizer - Minimum equity ratio', async () => {
  before(async () => {
    [admin, liquidator, guest, lzEndpoint] = await ethers.getSigners();
    // Variables
    usdxAmount = 1000e6;
    depositAmount = 10e6;
    mintAmount = toBN("90", 18);
    maxBorrow = toBN("100", 18);
    sweepAmount = toBN("1000", 18);
    ratio = toBN("1", 4); // 1 %

    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [
      lzEndpoint.address,
      addresses.owner,
      2500 // 0.25%
    ]);
    sweep = await Proxy.deployed();
    user = await impersonate(addresses.owner);
    await sweep.connect(user).setTreasury(addresses.treasury);

    ERC20 = await ethers.getContractFactory("ERC20");
    usdx = await ERC20.attach(addresses.usdc);
    aave_usdx = await ERC20.attach(addresses.aave_usdc);

    Uniswap = await ethers.getContractFactory("UniswapMock");
    uniswap_amm = await Uniswap.deploy(sweep.address, Const.FEE);
    await sweep.setAMM(uniswap_amm.address);

    AaveAsset = await ethers.getContractFactory("AaveV3Asset");
    aaveAsset = await AaveAsset.deploy(
      'Aave Asset',
      sweep.address,
      addresses.usdc,
      addresses.aave_usdc,
      addresses.aaveV3_pool,
      addresses.multisig
    );

    // add asset as a minter
    await sweep.addMinter(aaveAsset.address, sweepAmount);
    await sweep.addMinter(admin.address, sweepAmount.mul(3));

    // mint sweep for the liquidator
    // simulates a pool in uniswap with 10000 SWEEP/USDX
    await sweep.minterMint(liquidator.address, sweepAmount);
    await sweep.minterMint(uniswap_amm.address, sweepAmount);
    await sweep.minterMint(addresses.multisig, sweepAmount);

    user = await impersonate(addresses.usdc)
    await usdx.connect(user).transfer(uniswap_amm.address, usdxAmount);

    user = await impersonate(addresses.multisig);
    // config stabilizer
    await aaveAsset.connect(user).configure(
      ratio,
      Const.spreadFee,
      maxBorrow,
      Const.DISCOUNT,
      Const.DAYS_5,
      Const.RATIO,
      mintAmount,
      Const.TRUE,
      Const.URL
    );

    await sweep.connect(user).approve(aaveAsset.address, sweepAmount);
    await sweep.connect(liquidator).approve(aaveAsset.address, sweepAmount);
    initialUserUSDX = await usdx.balanceOf(user.address);
  });

  describe("Initial Test", async function () {
    it('deposit usdc to the asset', async () => {
      await usdx.connect(user).transfer(aaveAsset.address, depositAmount);
      expect(await usdx.balanceOf(aaveAsset.address)).to.equal(depositAmount);
    });

    it('mint and sell sweep', async () => {
      await expect(aaveAsset.connect(guest).borrow(mintAmount))
        .to.be.revertedWithCustomError(aaveAsset, 'NotBorrower');
      await aaveAsset.connect(user).borrow(mintAmount);
      expect(await aaveAsset.sweepBorrowed()).to.equal(mintAmount);

      await aaveAsset.connect(user).sellSweepOnAMM(mintAmount, 0);
      expect(await sweep.balanceOf(aaveAsset.address)).to.equal(Const.ZERO);
      expect(await usdx.balanceOf(aaveAsset.address)).to.above(depositAmount);
    });

    it('try to withdraw more than is permited', async () => {
      balance = await usdx.balanceOf(aaveAsset.address); // 100 %

      withdrawAmount1 = balance; // 100 %
      withdrawAmount2 = depositAmount; // 10 usd
      withdrawAmount3 = 95e5; // 9,5 usd
  
      await expect(aaveAsset.connect(user).withdraw(usdx.address, balance))
        .to.be.revertedWithCustomError(aaveAsset, "EquityRatioExcessed");

      await expect(aaveAsset.connect(user).withdraw(usdx.address, withdrawAmount1))
        .to.be.revertedWithCustomError(aaveAsset, "EquityRatioExcessed");

      await expect(aaveAsset.connect(user).withdraw(usdx.address, withdrawAmount3))
        .to.be.revertedWithCustomError(aaveAsset, "EquityRatioExcessed");
    });

    it('withdraw all permitted', async () => {
      withdrawAmount4 = 9e6; // 9 usd
      ratio = await aaveAsset.minEquityRatio();
      valueBefore = await aaveAsset.currentValue();

      await aaveAsset.connect(user).withdraw(usdx.address, withdrawAmount4);

      expect(await aaveAsset.getEquityRatio()).to.be.greaterThan(ratio);
      expect(await aaveAsset.currentValue()).to.be.eq(valueBefore.sub(withdrawAmount4));
    });
  })
});


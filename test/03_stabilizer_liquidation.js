const { expect } = require("chai");
const { ethers, contract } = require("hardhat");
const { addresses } = require("../utils/address");

contract("Stabilizer - Liquidation", async function () {
  before(async () => {
    [borrower, liquidator, other, treasury, lzEndpoint] = await ethers.getSigners();
    // Stabilizer config
    maxBorrow = ethers.utils.parseUnits("100", 18);
    maxSweep = ethers.utils.parseUnits("500000", 18);
    liquidatorBalance = ethers.utils.parseUnits("100000", 18);
    minEquityRatio = ethers.utils.parseUnits("1", 5); // 10%
    ratioDefault = ethers.utils.parseUnits("1", 6); // 20%
    spreadFee = ethers.utils.parseUnits("1", 4); // 1%
    liquidatorDiscount = ethers.utils.parseUnits("2", 5); // 2%
    callDelay = 604800; // 7 days
    autoInvestMinEquityRatio = 10e4; // 10%
    autoInvestMinAmount = ethers.utils.parseUnits("10", 18);
    autoInvest = true;
    // Constants
    ZERO = 0;
    usdcAmount = ethers.utils.parseUnits("10", 6);
    sweepAmount = ethers.utils.parseUnits("10", 18);
    sweepMintAmount = ethers.utils.parseUnits("50", 18);
    WETH_HOLDER = '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8';

    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [WETH_HOLDER, ethers.utils.parseEther('5').toHexString()]
    });

    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address);

    USDC = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
    WETH = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
    usdc = await USDC.attach(addresses.usdc);
    weth = await WETH.attach(addresses.weth);

    USDOracle = await ethers.getContractFactory("AggregatorMock");
    usdOracle = await USDOracle.deploy();

    WETHAsset = await ethers.getContractFactory("TokenAsset");
    // ------------- Initialize context -------------
    weth_asset = await WETHAsset.deploy(
      'WETH Asset',
      sweep.address,
      addresses.usdc,
      addresses.weth,
      addresses.oracle_weth_usd,
      amm.address,
      addresses.borrower,
      usdOracle.address
    );

    // simulates a pool in uniswap with 10000 SWEEP/USDX
    await sweep.addMinter(borrower.address, maxSweep);
    await sweep.minter_mint(amm.address, maxBorrow);
    await sweep.minter_mint(liquidator.address, liquidatorBalance);

    await impersonate(addresses.usdc)
    await usdc.connect(user).transfer(amm.address, 100e6);

    await impersonate(WETH_HOLDER);
    await weth.connect(user).transfer(amm.address, maxBorrow);
  });

  async function impersonate(account) {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [account]
    });
    user = await ethers.getSigner(account);
  }

  describe("liquidates a WETH Asset when this is defaulted", async function () {
    it("environment setup", async function () {
      expect(await weth_asset.isDefaulted()).to.equal(false);
      amm_price = await sweep.amm_price();

      await impersonate(addresses.usdc);
      await usdc.connect(user).transfer(weth_asset.address, usdcAmount); // stabilizer deposit      
      await sweep.addMinter(weth_asset.address, sweepMintAmount);
      await sweep.addMinter(addresses.borrower, sweepMintAmount.mul(2));

      await impersonate(addresses.borrower);
      await weth_asset.connect(user).configure(
        minEquityRatio,
        spreadFee,
        maxBorrow,
        liquidatorDiscount,
        callDelay,
        autoInvestMinEquityRatio,
        autoInvestMinAmount,
        autoInvest,
        "htttp://test.com"
      );
    });

    it("stabilizer takes a debt and invest into WETH Asset", async function () {
      expect(await weth_asset.assetValue()).to.equal(ZERO);
      expect(await weth_asset.isDefaulted()).to.equal(false);

      amount = sweepAmount.mul(2)
      await weth_asset.connect(user).borrow(amount);
      await weth_asset.connect(user).sellSweepOnAMM(amount, ZERO);

      balance = await usdc.balanceOf(weth_asset.address);
      await weth_asset.connect(user).invest(balance);

      expect(await weth_asset.currentValue()).to.not.equal(ZERO);
      expect(await usdc.balanceOf(weth_asset.address)).to.equal(ZERO);
    });

    it("liquidations correctly", async function () {
      expect(await weth_asset.sweep_borrowed()).to.equal(amount);
      expect(await weth_asset.isDefaulted()).to.equal(false);

      currentValueBefore = await weth_asset.assetValue();
      wethBalanceBefore = await weth.balanceOf(liquidator.address);

      await weth_asset.connect(user).configure(
        ratioDefault,
        spreadFee,
        maxBorrow,
        liquidatorDiscount,
        callDelay,
        autoInvestMinEquityRatio,
        autoInvestMinAmount,
        autoInvest,
        "htttp://test.com"
      );

      expect(await weth_asset.isDefaulted()).to.equal(true);
      
      await sweep.connect(liquidator).approve(weth_asset.address, liquidatorBalance);
      await weth_asset.connect(liquidator).liquidate();

      wethBalanceAfter = await weth.balanceOf(liquidator.address);
      currentValueAfter = await weth_asset.assetValue();

      expect(await weth_asset.isDefaulted()).to.equal(false);
      expect(await weth_asset.sweep_borrowed()).to.equal(ZERO);
      expect(await weth_asset.getDebt()).to.equal(ZERO);
      expect(currentValueBefore).to.above(ZERO);
      expect(currentValueAfter).to.equal(ZERO);
      expect(wethBalanceAfter).to.above(wethBalanceBefore);
    });

    it("can not liquidate a Stabilizer after has been liquidated", async function () {
      await expect(weth_asset.connect(liquidator).liquidate())
        .to.be.revertedWithCustomError(weth_asset, 'NotDefaulted');
    });
  });
});

const { expect } = require("chai");
const { ethers, contract } = require("hardhat");

contract("Stabilizer - Isolated Functions", async function () {
  before(async () => {
    [owner, borrower, wallet, treasury, other, multisig] = await ethers.getSigners();
    usdxAmount = 10000e6;
    sweepAmount = ethers.utils.parseUnits("10000", 18);
    mintAmount = ethers.utils.parseUnits("90", 18);
    tenSweep = ethers.utils.parseUnits("10", 18);

    maxBorrow = ethers.utils.parseUnits("100", 18);
    minimumEquityRatio = 1e4; // 1%
    spreadFee = 1e4; // 1%
    liquidatorDiscount = 2e4; // 2%
    callDelay = 432000; // 5 days
    autoInvestMinEquityRatio = 10e4; // 10%
    autoInvestMinAmount = ethers.utils.parseUnits("10", 18);
    autoInvest = true;
    ZERO = 0;

    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep);
    sweep = await Proxy.deployed();
    await sweep.setTreasury(treasury.address);

    Token = await ethers.getContractFactory("USDCMock");
    usdx = await Token.deploy();

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address, usdx.address);

    OffChainAsset = await ethers.getContractFactory("OffChainAsset");

    offChainAsset = await OffChainAsset.deploy(
      'OffChain Asset',
      sweep.address,
      usdx.address,
      wallet.address,
      amm.address,
      borrower.address
    );

    // ------------- Initialize context -------------
    await usdx.transfer(borrower.address, usdxAmount);
    await sweep.transfer(other.address, maxBorrow);
    await sweep.transfer(borrower.address, tenSweep);
    await offChainAsset.connect(borrower).configure(
      minimumEquityRatio,
      spreadFee,
      maxBorrow,
      liquidatorDiscount,
      callDelay,
      autoInvestMinEquityRatio,
      autoInvestMinAmount,
      autoInvest,
      "htttp://test.com"
    );
    await usdx.connect(borrower).approve(offChainAsset.address, 10000e6);
    await sweep.connect(borrower).approve(offChainAsset.address, tenSweep);
    await sweep.connect(other).approve(offChainAsset.address, maxBorrow);

    // simulates a pool in uniswap with 10000 SWEEP/USDX
    await sweep.addMinter(owner.address, sweepAmount.mul(2));
    await sweep.minter_mint(amm.address, sweepAmount);
    await sweep.minter_mint(other.address, sweepAmount);
    await usdx.transfer(amm.address, usdxAmount);
  });

  describe("get the junior investment", async function () {
    it("gets the value of the junior tranche before and after of deposit", async function () {
      expect(await offChainAsset.getJuniorTrancheValue()).to.be.equal(ZERO);
      await usdx.connect(borrower).transfer(offChainAsset.address, 10e6);
      expect(await offChainAsset.getJuniorTrancheValue()).to.be.equal(10e6);
    });
  });

  describe("mint function", async function () {
    describe("mints correctly", async function () {
      it("takes debt into the senior tranche", async function () {
        await sweep.addMinter(offChainAsset.address, maxBorrow);
        ratioBefore = await offChainAsset.getEquityRatio();
        expect(ratioBefore).to.be.equal(1e6); // 100%

        await offChainAsset.connect(borrower).borrow(mintAmount);
        ratioAfter = await offChainAsset.getEquityRatio();
        expect(ratioAfter).to.be.equal(1e5); // 10%
        expect(ratioBefore > ratioAfter).to.be.equal(true);
        expect(await offChainAsset.sweep_borrowed()).to.equal(mintAmount);
      });
    });
  });

  describe("invest function", async function () {
    it("sends sweep to the offChainAsset correctly", async function () {
      expect(await usdx.balanceOf(offChainAsset.address)).to.equal(10e6);
      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(mintAmount);
      expect(await offChainAsset.assetValue()).to.equal(ZERO);
      expect(await offChainAsset.currentValue()).to.equal(100e6); // 10 USDC - 90 SWEEP
      expect(await usdx.balanceOf(wallet.address)).to.equal(ZERO);
      expect(await sweep.balanceOf(wallet.address)).to.equal(ZERO);

      await offChainAsset.connect(borrower).invest(20e6, mintAmount.mul(2));

      expect(await offChainAsset.currentValue()).to.equal(100e6);
      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(ZERO);
      expect(await usdx.balanceOf(offChainAsset.address)).to.equal(ZERO);

      expect(await sweep.balanceOf(wallet.address)).to.equal(mintAmount);
      expect(await usdx.balanceOf(wallet.address)).to.equal(10e6);
    });
  });

  describe("payback and repay functions", async function () {
    it("change the usdx for sweep ", async function () {
      await sweep.transfer(wallet.address, tenSweep);

      expect(await sweep.balanceOf(wallet.address)).to.equal(maxBorrow);
    });

    it("tries to repay without balance", async function () {
      await expect(offChainAsset.connect(borrower).repay(maxBorrow))
        .to.be.revertedWithCustomError(offChainAsset, 'NotEnoughBalance');
    });

    it("receives sweep correctly", async function () {
      await offChainAsset.connect(borrower).divest(maxBorrow);

      expect(await offChainAsset.redeem_mode()).to.equal(true);
      await sweep.connect(wallet).transfer(offChainAsset.address, maxBorrow);

      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(maxBorrow);
      expect(await sweep.balanceOf(wallet.address)).to.equal(ZERO);
    });

    it("burns sweeps token correctly", async function () {
      expect(await offChainAsset.sweep_borrowed()).to.equal(mintAmount);
      await offChainAsset.connect(borrower).repay(maxBorrow);
    });
  });

  describe("withdraw function", async function () {
    it("withdraws sweep correctly", async function () {
      expect(await offChainAsset.getEquityRatio()).to.equal(1e6); // 100%      
      balance = await sweep.balanceOf(offChainAsset.address);
      await offChainAsset.connect(borrower).withdraw(sweep.address, balance);
    });
  });

  describe("buy & sell SWEEP from stabilizer", async function () {
    it("tries to buy without balance", async function () {
      await expect(offChainAsset.connect(borrower).swapUsdcToSweep(usdxAmount))
        .to.be.revertedWithCustomError(offChainAsset, 'NotEnoughBalance');
    });

    it("buy SWEEP", async function () {
      usdxAmount = ethers.utils.parseUnits("50", 6);

      await offChainAsset.connect(borrower).borrow(mintAmount);

      sweepBalanceBefore = await sweep.balanceOf(borrower.address);
      usdxBalanceBefore = await usdx.balanceOf(offChainAsset.address);

      targetPrice = await sweep.target_price();
      expectSweepAmount = (usdxAmount.toNumber() / targetPrice) * 1e18;
      await offChainAsset.connect(borrower).swapUsdcToSweep(usdxAmount);

      sweepBalanceAfter = sweepBalanceBefore.toBigInt() + ethers.BigNumber.from(expectSweepAmount.toString()).toBigInt();
      usdxBalanceAfter = usdxBalanceBefore.toNumber() + usdxAmount.toNumber();

      expect(await sweep.balanceOf(borrower.address)).to.equal(sweepBalanceAfter);
      expect(await usdx.balanceOf(offChainAsset.address)).to.equal(usdxBalanceAfter);
    });

    it("sell SWEEP through the AMM", async function () {
      balance = await sweep.balanceOf(offChainAsset.address);
      await offChainAsset.connect(borrower).sellSweepOnAMM(balance, 0);

      expect(await usdx.balanceOf(offChainAsset.address)).to.equal(89880000);
      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(ZERO);
    });

    it("buy SWEEP through the AMM", async function () {
      usdxAmount = ethers.utils.parseUnits("50", 6);
      sweepAmount = ethers.utils.parseUnits("49.85", 18); // 50 * 0.997 (0.03% fee of uniswap)
      balanceBefore = await usdx.balanceOf(offChainAsset.address);

      await offChainAsset.connect(borrower).buySweepOnAMM(usdxAmount, 0);

      balanceAfter = await usdx.balanceOf(offChainAsset.address);

      expect(balanceAfter.add(usdxAmount)).to.equal(balanceBefore);
      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(sweepAmount);
    });

    it("Sell SWEEP", async function () {
      sweepAmount = ethers.utils.parseUnits("30", 18);
      sweepBalanceBefore = await sweep.balanceOf(offChainAsset.address);
      usdxBalanceBefore = await usdx.balanceOf(borrower.address);

      targetPrice = await sweep.target_price();
      expectUSXAmount = (30e6 * targetPrice) / 1e6;

      await sweep.connect(borrower).approve(offChainAsset.address, sweepAmount);
      await offChainAsset.connect(borrower).swapSweepToUsdc(sweepAmount);

      sweepBalanceAfter = sweepBalanceBefore.toBigInt() + ethers.BigNumber.from(sweepAmount.toString()).toBigInt();
      usdxBalanceAfter = usdxBalanceBefore.toNumber() + expectUSXAmount;
      expect(await sweep.balanceOf(offChainAsset.address)).to.equal(sweepBalanceAfter);
      expect(await usdx.balanceOf(borrower.address)).to.equal(usdxBalanceAfter);
    });
  });
});

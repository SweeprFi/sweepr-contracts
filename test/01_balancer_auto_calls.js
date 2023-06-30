const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { impersonate, Const, toBN, getBlockTimestamp } = require("../utils/helper_functions");
let user;

contract('Balancer - Auto Call', async () => {
  before(async () => {
    [owner, lzEndpoint, wallet] = await ethers.getSigners();
    // constants
    BORROWER = addresses.borrower;
    USDC_ADDRESS = addresses.usdc;
    TREASURY = addresses.treasury;
    WALLET = wallet.address;

    MAX_MINT = toBN("1000", 18);
    SWEEP_MINT = toBN("800", 18);
    AUTO_MIN_AMOUNT = toBN("200", 18);
    HALF_MINT = toBN("400", 18);

    TOTAL_USDC = 900e6;
    USDC_AMOUNT = 100e6;
    MIN_RATIO = 1e5; // 10 %
    loanLimit = SWEEP_MINT; // 900 sweeps
    AUTO_MIN_RATIO = 5e4; // 5%

    // Contracts
    usdc = await ethers.getContractAt("ERC20", USDC_ADDRESS);
    // Deploys
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [
      lzEndpoint.address,
      owner.address,
      2500 // 0.25%
    ]);
    sweep = await Proxy.deployed();

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address, Const.FEE);
    await sweep.setAMM(amm.address);

    Balancer = await ethers.getContractFactory("Balancer");
    balancer = await Balancer.deploy(sweep.address, lzEndpoint.address);

    StabilizerAave = await ethers.getContractFactory("AaveV3Asset");
    OffChainAsset = await ethers.getContractFactory("OffChainAsset");

    assets = await Promise.all(
      Array(5).fill().map(async () => {
        return await StabilizerAave.deploy(
          'Aave Asset',
          sweep.address,
          USDC_ADDRESS,
          addresses.aave_usdc,
          addresses.aaveV3_pool,
          BORROWER
        );
      })
    );

    assets[5] = await OffChainAsset.deploy(
      'OffChain Asset',
      sweep.address,
      USDC_ADDRESS,
      WALLET,
      amm.address,
      BORROWER
    );
  });

  describe('Auto Calls - Balancer & Stabilizers', async () => {
    it('config the initial state', async () => {
      user = await impersonate(BORROWER);
      await Promise.all(
        assets.map(async (asset, index) => {
          if (index < 5) {
            await asset.connect(user).configure(
              MIN_RATIO,
              Const.spreadFee,
              loanLimit,
              Const.DISCOUNT,
              Const.ZERO,
              AUTO_MIN_RATIO,
              AUTO_MIN_AMOUNT,
              Const.TRUE,
              Const.URL
            )
          };
        })
      );

      await assets[5].connect(user).configure(
        MIN_RATIO,
        Const.spreadFee,
        loanLimit,
        Const.DISCOUNT,
        Const.DAYS_5,
        AUTO_MIN_RATIO,
        AUTO_MIN_AMOUNT,
        Const.TRUE,
        Const.URL
      );

      // adds the assets to the minter list
      await sweep.setBalancer(balancer.address);
      await sweep.addMinter(assets[0].address, MAX_MINT);
      await sweep.addMinter(assets[1].address, MAX_MINT);
      await sweep.addMinter(assets[2].address, MAX_MINT);
      await sweep.addMinter(assets[3].address, MAX_MINT);
      await sweep.addMinter(assets[4].address, MAX_MINT);
      await sweep.addMinter(assets[5].address, MAX_MINT);
      
      await sweep.setTreasury(TREASURY);
      
      // sends funds to Borrower
      user = await impersonate(USDC_ADDRESS);
      await usdc.connect(user).transfer(BORROWER, USDC_AMOUNT * 6);
      await usdc.connect(user).transfer(amm.address, USDC_AMOUNT * 100);
      await sweep.transfer(amm.address, MAX_MINT);
    });

    it('deposits and mints sweep', async () => {
      user = await impersonate(BORROWER);
      await Promise.all(
        assets.map(async (asset) => {
          await usdc.connect(user).transfer(asset.address, USDC_AMOUNT);
        })
      );

      // takes debts
      await Promise.all(
        assets.map(async (asset) => {
          await asset.connect(user).borrow(SWEEP_MINT);
        })
      );

      expect(await assets[0].sweepBorrowed()).to.equal(SWEEP_MINT);
      expect(await assets[1].sweepBorrowed()).to.equal(SWEEP_MINT);
      expect(await assets[2].sweepBorrowed()).to.equal(SWEEP_MINT);
      expect(await assets[3].sweepBorrowed()).to.equal(SWEEP_MINT);
      expect(await assets[4].sweepBorrowed()).to.equal(SWEEP_MINT);
      expect(await assets[5].sweepBorrowed()).to.equal(SWEEP_MINT);
    });

    it('config the assets', async () => {
      user = await impersonate(BORROWER);
      await assets[1].connect(user).sellSweepOnAMM(SWEEP_MINT, Const.ZERO);
      await assets[2].connect(user).sellSweepOnAMM(SWEEP_MINT, Const.ZERO);
      await assets[3].connect(user).sellSweepOnAMM(HALF_MINT, Const.ZERO);
      await assets[4].connect(user).sellSweepOnAMM(SWEEP_MINT, Const.ZERO);

      balance2 = await usdc.balanceOf(assets[2].address);
      await assets[2].connect(user).invest(balance2);

      balance3 = await usdc.balanceOf(assets[3].address);
      await assets[3].connect(user).invest(balance3.mul(3).div(4));

      balance4 = await usdc.balanceOf(assets[4].address);
      await assets[4].connect(user).invest(balance4);
      await assets[5].connect(user).invest(USDC_AMOUNT, SWEEP_MINT);

      expect(await usdc.balanceOf(assets[0].address)).to.equal(USDC_AMOUNT);
      expect(await sweep.balanceOf(assets[0].address)).to.equal(SWEEP_MINT);
      expect(await assets[0].assetValue()).to.equal(Const.ZERO);
      fee = await assets[0].accruedFee();
      fee = await sweep.convertToUSD(fee);
      expect(await assets[0].currentValue()).to.equal(TOTAL_USDC-fee);

      expect(await usdc.balanceOf(assets[1].address)).to.above(USDC_AMOUNT);
      expect(await sweep.balanceOf(assets[1].address)).to.equal(Const.ZERO);
      expect(await assets[1].assetValue()).to.equal(Const.ZERO);

      expect(await usdc.balanceOf(assets[2].address)).to.equal(Const.ZERO);
      expect(await sweep.balanceOf(assets[2].address)).to.equal(Const.ZERO);
      currentValue = await assets[2].currentValue();
      fee = await assets[2].accruedFee();
      fee = await sweep.convertToUSD(fee);
      expect(await assets[2].assetValue()).to.equal(currentValue.add(fee));

      expect(await usdc.balanceOf(assets[3].address)).to.equal(balance3.mul(1).div(4));
      expect(await sweep.balanceOf(assets[3].address)).to.equal(HALF_MINT);
      expect(await assets[3].assetValue()).to.above(Const.ZERO);

      expect(await usdc.balanceOf(assets[5].address)).to.equal(Const.ZERO);
      expect(await sweep.balanceOf(assets[5].address)).to.equal(Const.ZERO);
      expect(await assets[5].assetValue()).to.equal(TOTAL_USDC);
    });

    it('balancer calls the Stabilizers to repay debts', async () => {
      targets = assets.map((asset) => { return asset.address });
      amount = toBN("750", 18);
      amounts = [amount, amount, amount, amount, 0, amount];
      CALL_SWEEP = toBN("825", 18);
      CALL_USDC = toBN("92455", 4);
      NEW_loanLimit = toBN("50", 18);

      assetValue3 = await assets[3].assetValue();

      // constraints
      user = await impersonate(USDC_ADDRESS);
      await balancer.addActions(targets, amounts);
      await balancer.execute(2, true, 1e6, 2000); // 2 => call, force: true, 1 => price, 2000 => slippage

      timestamp = await getBlockTimestamp();

      // asset 1 paid his debt with Sweep
      expect(await usdc.balanceOf(assets[0].address)).to.equal(USDC_AMOUNT);
      expect(await sweep.balanceOf(assets[0].address)).to.equal(NEW_loanLimit);
      expect(await assets[0].callAmount()).to.equal(Const.ZERO);

      // asset 2 paid his debt with USDC
      expect(await usdc.balanceOf(assets[1].address)).to.not.above(CALL_USDC);
      expect(await sweep.balanceOf(assets[1].address)).to.equal(Const.ZERO);
      expect(await assets[1].callAmount()).to.equal(Const.ZERO);

      // asset 3 paid his debt after divest
      expect(await usdc.balanceOf(assets[2].address)).to.equal(Const.ZERO);
      expect(await sweep.balanceOf(assets[2].address)).to.equal(Const.ZERO);
      expect(await assets[2].callAmount()).to.equal(Const.ZERO);

      // asset 4 paid his debt using SWEEP, USDC and divest
      expect(await usdc.balanceOf(assets[3].address)).to.equal(Const.ZERO);
      expect(await sweep.balanceOf(assets[3].address)).to.equal(Const.ZERO);
      expect(await assets[3].assetValue()).to.not.equal(assetValue3);
      expect(await assets[3].callAmount()).to.equal(Const.ZERO);

      // asset 5 - Off chain asset
      expect(await usdc.balanceOf(assets[4].address)).to.equal(Const.ZERO);
      expect(await sweep.balanceOf(assets[4].address)).to.equal(Const.ZERO);

      // asset 6 - Off chain asset
      expect(await usdc.balanceOf(assets[5].address)).to.equal(Const.ZERO);
      expect(await sweep.balanceOf(assets[5].address)).to.equal(Const.ZERO);
      expect(await assets[5].assetValue()).to.equal(TOTAL_USDC);
      expect(await assets[5].callAmount()).to.equal(amount);
      expect(await assets[5].callTime()).to.equal(timestamp + Const.DAYS_5);

      // new loan limits
      expect(await assets[0].loanLimit()).to.eq(NEW_loanLimit);
      expect(await assets[1].loanLimit()).to.eq(NEW_loanLimit);
      expect(await assets[2].loanLimit()).to.eq(NEW_loanLimit);
      expect(await assets[3].loanLimit()).to.eq(NEW_loanLimit);
      expect(await assets[4].loanLimit()).to.eq(loanLimit);
      expect(await assets[5].loanLimit()).to.eq(NEW_loanLimit);
    });

    it('cancels call correctly', async () => {
      await expect(balancer.connect(wallet).cancelCall(assets[4].address))
        .to.be.revertedWithCustomError(balancer, "NotMultisig");

      await balancer.cancelCall(assets[4].address);
      expect(await assets[4].callTime()).to.equal(Const.ZERO);
      expect(await assets[4].callAmount()).to.equal(Const.ZERO);
    });
  });
});

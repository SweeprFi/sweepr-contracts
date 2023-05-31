const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { impersonate, Const, toBN } = require("../utils/helper_functions");
let user;

contract('Balancer - Auto Call', async () => {
  before(async () => {
    [owner, lzEndpoint] = await ethers.getSigners();
    // constants
    BORROWER = addresses.borrower;
    USDC_ADDRESS = addresses.usdc;
    TREASURY = addresses.treasury;
    MAX_MINT = toBN("1000", 18);
    SWEEP_MINT = toBN("100", 18);
    HALF_MINT = toBN("50", 18);
    AUTO_MIN_AMOUNT = toBN("10", 18);
    USDC_AMOUNT = 20e6;
    MIN_RATIO = 1e5; // 10 %
    LOAN_LIMIT = SWEEP_MINT; // 100 sweeps
    AUTO_MIN_RATIO = 5e4; // 5%

    // Contracts
    usdc = await ethers.getContractAt("ERC20", addresses.usdc);
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
    balancer = await Balancer.deploy(sweep.address);

    StabilizerAave = await ethers.getContractFactory("AaveV3Asset");
    assets = await Promise.all(
      Array(4).fill().map(async () => {
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
  });

  describe('Auto Calls - Balancer & Stabilizers', async () => {
    it('config the initial state', async () => {
      user = await impersonate(BORROWER);
      await Promise.all(
        assets.map(async (asset) => {
          await asset.connect(user).configure(
            MIN_RATIO,
            Const.SPREAD_FEE,
            LOAN_LIMIT,
            Const.DISCOUNT,
            Const.ZERO,
            AUTO_MIN_RATIO,
            AUTO_MIN_AMOUNT,
            Const.TRUE,
            Const.URL
          );
        })
      );

      // adds the assets to the minter list
      await sweep.setBalancer(balancer.address);
      await sweep.addMinter(assets[0].address, MAX_MINT);
      await sweep.addMinter(assets[1].address, MAX_MINT);
      await sweep.addMinter(assets[2].address, MAX_MINT);
      await sweep.addMinter(assets[3].address, MAX_MINT);

      await sweep.setTreasury(TREASURY);
      
      // sends funds to Borrower
      user = await impersonate(USDC_ADDRESS);
      await usdc.connect(user).transfer(BORROWER, USDC_AMOUNT * 4);
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

      expect(await assets[0].sweep_borrowed()).to.equal(SWEEP_MINT);
      expect(await assets[1].sweep_borrowed()).to.equal(SWEEP_MINT);
      expect(await assets[2].sweep_borrowed()).to.equal(SWEEP_MINT);
      expect(await assets[3].sweep_borrowed()).to.equal(SWEEP_MINT);
    });

    it('config the assets', async () => {
      user = await impersonate(BORROWER);
      await assets[1].connect(user).sellSweepOnAMM(SWEEP_MINT, Const.ZERO);
      await assets[2].connect(user).sellSweepOnAMM(SWEEP_MINT, Const.ZERO);
      await assets[3].connect(user).sellSweepOnAMM(HALF_MINT, Const.ZERO);

      balance = await usdc.balanceOf(assets[2].address);
      await assets[2].connect(user).invest(balance);
      investedValue3 = await assets[2].assetValue();

      balance = await usdc.balanceOf(assets[3].address);
      await assets[3].connect(user).invest(balance.mul(3).div(4));
      investedValue4 = await assets[3].assetValue();

      expect(await usdc.balanceOf(assets[0].address)).to.equal(USDC_AMOUNT);
      expect(await sweep.balanceOf(assets[0].address)).to.equal(SWEEP_MINT);

      expect(await usdc.balanceOf(assets[1].address)).to.above(USDC_AMOUNT);
      expect(await sweep.balanceOf(assets[1].address)).to.equal(Const.ZERO);

      expect(await usdc.balanceOf(assets[2].address)).to.equal(Const.ZERO);
      expect(await sweep.balanceOf(assets[2].address)).to.equal(Const.ZERO);
      expect(investedValue3).to.above(Const.ZERO);

      expect(await sweep.balanceOf(assets[3].address)).to.equal(HALF_MINT);
      expect(investedValue4).to.above(Const.ZERO);
    });

    it('balancer calls the Stabilizers to repay debts', async () => {
      targets = assets.map((asset) => { return asset.address });
      amount = toBN("75", 18);
      amounts = [amount, amount, amount, amount]; // 75 Sweep to each stabilizer
      CALL_SWEEP = toBN("75", 18);
      CALL_USDC = toBN("75", 6);
      NEW_LOAN_LIMIT = toBN("25", 18);

      assetValue = await assets[3].assetValue();

      // constraints
      user = await impersonate(USDC_ADDRESS);

      await balancer.addActions(targets, amounts);
      await balancer.execute(2, true); // 2 => call, force: true

      // asset 1 paid his debt with Sweep
      expect(await usdc.balanceOf(assets[0].address)).to.equal(USDC_AMOUNT);
      expect(await sweep.balanceOf(assets[0].address)).to.above(Const.ZERO);
      expect(await sweep.balanceOf(assets[0].address)).to.not.above(CALL_SWEEP);

      // asset 2 paid his debt with USDC
      expect(await usdc.balanceOf(assets[1].address)).to.not.above(CALL_USDC);
      expect(await sweep.balanceOf(assets[1].address)).to.equal(Const.ZERO);

      // asset 3 paid his debt after divest
      expect(await usdc.balanceOf(assets[2].address)).to.equal(Const.ZERO);
      expect(await sweep.balanceOf(assets[2].address)).to.equal(Const.ZERO);
      expect(await assets[2].call_amount()).to.equal(Const.ZERO);
      expect(await assets[2].assetValue()).to.not.above(investedValue3);

      // asset 4 paid his debt using SWEEP, USDC and divest
      expect(await usdc.balanceOf(assets[3].address)).to.equal(Const.ZERO);
      expect(await sweep.balanceOf(assets[3].address)).to.equal(HALF_MINT);
      expect(await assets[3].assetValue()).to.not.equal(assetValue);

      expect(await assets[0].loan_limit()).to.eq(NEW_LOAN_LIMIT);
      expect(await assets[1].loan_limit()).to.eq(NEW_LOAN_LIMIT);
      expect(await assets[2].loan_limit()).to.eq(NEW_LOAN_LIMIT);
      expect(await assets[3].loan_limit()).to.eq(NEW_LOAN_LIMIT);
    });
  });
});

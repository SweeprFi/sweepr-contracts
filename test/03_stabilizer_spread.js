const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { increaseTime, impersonate, Const, toBN, getBlockTimestamp } = require("../utils/helper_functions");

contract("Stabilizer and spread", async function () {
  before(async () => {
    [owner, borrower, liquidater, wallet, treasury, multisig, lzEndpoint, agent] = await ethers.getSigners();
    usdxAmount = 1000e6;
    investAmount = 10e6;
    sweepAmount = toBN("1000", 18);
    maxBorrow = toBN("100", 18);
    mintAmountFir = toBN("10", 18);
    mintAmountSec = toBN("30", 18);
    mintAmountThr = toBN("32", 18);
    buyAmount = toBN("5", 18);
    autoInvestMinAmount = toBN("10", 18);
    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [
      lzEndpoint.address,
      addresses.owner,
      2500 // 0.25%
    ]);
    sweep = await Proxy.deployed();
    user = await impersonate(addresses.owner);
    await sweep.connect(user).setTreasury(addresses.treasury);

    Token = await ethers.getContractFactory("USDCMock");
    usdx = await Token.deploy();

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address, Const.FEE);
    await sweep.setAMM(amm.address);

    OffChainAsset = await ethers.getContractFactory("OffChainAsset");
  });

  beforeEach(async () => {
    offChainAsset = await OffChainAsset.deploy(
      'OffChain Asset',
      sweep.address,
      usdx.address,
      wallet.address,
      agent.address,
      addresses.oracle_usdc_usd,
      borrower.address
    );

    // ------------- Initialize context -------------
    await usdx.transfer(borrower.address, investAmount);
    await usdx.transfer(owner.address, investAmount);
    await usdx.approve(offChainAsset.address, usdxAmount);
    await usdx.connect(borrower).approve(offChainAsset.address, usdxAmount);
    balance = await usdx.balanceOf(borrower.address);

    await offChainAsset.connect(borrower).configure(
      Const.RATIO,
      Const.spreadFee,
      maxBorrow,
      Const.DISCOUNT,
      Const.DAYS_5,
      Const.RATIO,
      maxBorrow,
      Const.FALSE,
      Const.FALSE,
      Const.URL
    );

    await sweep.addMinter(offChainAsset.address, maxBorrow);
    if (balance.toNumber() < investAmount) {
      amount = investAmount - balance.toNumber();
      await usdx.transfer(borrower.address, amount);
    } else {
      amount = balance.toNumber() - investAmount;
      await usdx.connect(borrower).transfer(owner.address, amount);
    }
  });

  it("Main Test", async function () {
    expect(await usdx.balanceOf(borrower.address)).to.equal(10e6);
    expect(await usdx.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);
    expect(await sweep.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);
    expect(await offChainAsset.accruedFee()).to.equal(Const.ZERO);

    // First Mint
    st = offChainAsset.connect(borrower);
    await usdx.connect(borrower).transfer(offChainAsset.address, investAmount);
    await st.borrow(mintAmountFir);

    timestamp = await getBlockTimestamp();

    expect(await usdx.balanceOf(offChainAsset.address)).to.equal(investAmount);
    expect(await sweep.balanceOf(offChainAsset.address)).to.equal(mintAmountFir);
    expect(await offChainAsset.sweepBorrowed()).to.equal(mintAmountFir);
    expect(await offChainAsset.spreadDate()).to.equal(timestamp);
    expect(await offChainAsset.accruedFee()).to.equal(Const.ZERO);
    await increaseTime(Const.DAY*100); // Delay 100 hours
    expect(await offChainAsset.accruedFee()).to.above(Const.ZERO);

    // Second Mint
    await st.borrow(mintAmountSec);
    timestamp = await getBlockTimestamp();
    sum = mintAmountFir.add(mintAmountSec);

    expect(await sweep.balanceOf(offChainAsset.address)).to.not.above(sum);
    expect(await offChainAsset.sweepBorrowed()).to.equal(sum);
    expect(await offChainAsset.spreadDate()).to.equal(timestamp);
    expect(await offChainAsset.accruedFee()).to.equal(Const.ZERO);

    await increaseTime(Const.DAY*7); // Delay 7 days
    expect(await offChainAsset.accruedFee()).to.above(Const.ZERO);

    // Repay
    await st.repay(mintAmountFir);
    expect(await sweep.balanceOf(offChainAsset.address)).to.not.above(mintAmountSec);
    expect(await offChainAsset.sweepBorrowed()).to.above(mintAmountSec);
  });

  it("Repays without knowing the spread.", async function () {
    st = offChainAsset.connect(borrower);
    await usdx.connect(borrower).transfer(offChainAsset.address, investAmount);
    await st.borrow(mintAmountSec);
    await increaseTime(Const.DAY*100); // Delay 100 hours

    await st.repay(mintAmountSec);

    expect(await sweep.balanceOf(offChainAsset.address)).to.equal(Const.ZERO);
    expect(await offChainAsset.sweepBorrowed()).to.above(Const.ZERO);
  });

  it("Repays with the spread.", async function () {
    st = offChainAsset.connect(borrower);
    await usdx.connect(borrower).transfer(offChainAsset.address, investAmount);
    await st.borrow(mintAmountFir);
    await increaseTime(Const.DAY*100); // Delay 100 hours

    spread_amount = await st.accruedFee();
    burn_amount = mintAmountFir.add(spread_amount);

    await sweep.transfer(offChainAsset.address, mintAmountFir);
    await st.payFee();
    await st.repay(burn_amount);

    expect(await sweep.balanceOf(offChainAsset.address)).to.above(Const.ZERO);
    expect(await offChainAsset.sweepBorrowed()).to.equal(Const.ZERO);
  });
});
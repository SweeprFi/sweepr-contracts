const { expect } = require("chai");
const { ethers } = require("hardhat");

contract("Stabilizer and spread", async function () {
  before(async () => {
    [owner, borrower, liquidater, wallet, treasury, multisig] = await ethers.getSigners();
    usdxAmount = 1000e6;
    sweepAmount = ethers.utils.parseUnits("1000", 18);
    maxBorrow = ethers.utils.parseUnits("100", 18);

    ZERO = 0;
    investAmount = 10e6;
    minimumEquityRatio = 1e4; // 1%
    mintAmountFir = ethers.utils.parseUnits("10", 18);
    mintAmountSec = ethers.utils.parseUnits("30", 18);
    mintAmountThr = ethers.utils.parseUnits("32", 18);

    buyAmount = ethers.utils.parseUnits("5", 18);

    spreadFee = 3e4; // 3%
    liquidatorDiscount = 2e4; // 2%
    callDelay = 432000; // 5 days
    autoInvestMinEquityRatio = 10e4; // 10%
    autoInvestMinAmount = ethers.utils.parseUnits("10", 18);
    autoInvest = true;

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
  });

  beforeEach(async () => {
    offChainAsset = await OffChainAsset.deploy(
      'OffChain Asset',
      sweep.address,
      usdx.address,
      wallet.address,
      amm.address,
      borrower.address
    );

    // ------------- Initialize context -------------
    await usdx.transfer(borrower.address, investAmount);
    await usdx.transfer(owner.address, investAmount);
    await usdx.approve(offChainAsset.address, usdxAmount);
    await usdx.connect(borrower).approve(offChainAsset.address, usdxAmount);
    balance = await usdx.balanceOf(borrower.address);

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

    await sweep.addMinter(offChainAsset.address, maxBorrow);
    if (balance.toNumber() < investAmount) {
      amount = investAmount - balance.toNumber();
      await usdx.transfer(borrower.address, amount);
    } else {
      amount = balance.toNumber() - investAmount;
      await usdx.connect(borrower).transfer(owner.address, amount);
    }
  });

  async function increaseTime(seconds) {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  }

  it("Main Test", async function () {
    expect(await usdx.balanceOf(borrower.address)).to.equal(10e6);
    expect(await usdx.balanceOf(offChainAsset.address)).to.equal(ZERO);
    expect(await sweep.balanceOf(offChainAsset.address)).to.equal(ZERO);
    expect(await offChainAsset.accruedFee()).to.equal(ZERO);

    // First Mint
    st = offChainAsset.connect(borrower);
    await usdx.connect(borrower).transfer(offChainAsset.address, investAmount);
    await st.borrow(mintAmountFir);

    blockNumber = await ethers.provider.getBlockNumber();
    block = await ethers.provider.getBlock(blockNumber);

    expect(await usdx.balanceOf(offChainAsset.address)).to.equal(investAmount);
    expect(await sweep.balanceOf(offChainAsset.address)).to.equal(mintAmountFir);
    expect(await offChainAsset.sweep_borrowed()).to.equal(mintAmountFir);
    expect(await offChainAsset.spread_date()).to.equal(block.timestamp);
    expect(await offChainAsset.accruedFee()).to.equal(ZERO);
    await increaseTime(360000); // Delay 100 hours
    expect(await offChainAsset.accruedFee()).to.above(ZERO);

    // Second Mint
    await st.borrow(mintAmountSec);
    blockNumber = await ethers.provider.getBlockNumber();
    block = await ethers.provider.getBlock(blockNumber);
    sum = mintAmountFir.add(mintAmountSec);

    expect(await sweep.balanceOf(offChainAsset.address)).to.not.above(sum);
    expect(await offChainAsset.sweep_borrowed()).to.equal(sum);
    expect(await offChainAsset.spread_date()).to.equal(block.timestamp);
    expect(await offChainAsset.accruedFee()).to.equal(ZERO);

    await increaseTime(604800); // Delay 7 days
    expect(await offChainAsset.accruedFee()).to.above(ZERO);

    // Repay
    await st.repay(mintAmountFir);
    expect(await sweep.balanceOf(offChainAsset.address)).to.not.above(mintAmountSec);
    expect(await offChainAsset.sweep_borrowed()).to.above(mintAmountSec);
  });

  it("Repays without knowing the spread.", async function () {
    st = offChainAsset.connect(borrower);
    await usdx.connect(borrower).transfer(offChainAsset.address, investAmount);
    await st.borrow(mintAmountSec);
    await increaseTime(360000); // Delay 100 hours

    await st.repay(mintAmountSec);

    expect(await sweep.balanceOf(offChainAsset.address)).to.equal(ZERO);
    expect(await offChainAsset.sweep_borrowed()).to.above(ZERO);
  });

  it("Repays with the spread.", async function () {
    st = offChainAsset.connect(borrower);
    await usdx.connect(borrower).transfer(offChainAsset.address, investAmount);
    await st.borrow(mintAmountFir);
    await increaseTime(360000); // Delay 100 hours

    spread_amount = await st.accruedFee();
    burn_amount = mintAmountFir.add(spread_amount);

    await sweep.transfer(offChainAsset.address, mintAmountFir);
    await st.payFee();
    await st.repay(burn_amount);

    expect(await sweep.balanceOf(offChainAsset.address)).to.above(ZERO);
    expect(await offChainAsset.sweep_borrowed()).to.equal(ZERO);
  });
});
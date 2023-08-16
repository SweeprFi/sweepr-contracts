const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { Const, toBN } = require("../utils/helper_functions");

contract("Test Equity Ratio of Stabilizer", async function () {
  before(async () => {
    [owner, borrower, wallet, treasury, multisig, lzEndpoint] = await ethers.getSigners();
    usdxAmount = 1000e6;
    investAmount = 10e6;
    sweepAmount = toBN("1000", 18);
    maxBorrow = toBN("100", 18);
    mintAmount = toBN("90", 18);

    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [
      lzEndpoint.address,
      addresses.owner,
      50 // 0.005%
    ]);
    sweep = await Proxy.deployed();

    Token = await ethers.getContractFactory("USDCMock");
    usdx = await Token.deploy();

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address, Const.FEE);
    await sweep.setAMM(amm.address);

    OffChainAsset = await ethers.getContractFactory("OffChainAsset");
    offChainAsset = await OffChainAsset.deploy(
      'OffChain Asset',
      sweep.address,
      usdx.address,
      wallet.address,
      amm.address,
      addresses.oracle_usdc_usd,
      borrower.address
    );

    // ------------- Initialize context -------------
    await sweep.addMinter(offChainAsset.address, maxBorrow);
    await usdx.transfer(amm.address, usdxAmount);
    await sweep.transfer(amm.address, sweepAmount);
    await usdx.transfer(borrower.address, investAmount);
    await usdx.approve(offChainAsset.address, usdxAmount);
    await offChainAsset.connect(borrower).configure(
      Const.RATIO,
      Const.spreadFee,
      maxBorrow,
      Const.DISCOUNT,
      Const.DAYS_5,
      Const.RATIO,
      maxBorrow,
      Const.FALSE,
      Const.URL
    );
    await usdx.connect(borrower).approve(offChainAsset.address, usdxAmount);
  });

  it("Main Test", async function () {
    balanceBefore = await usdx.balanceOf(borrower.address)
    expect(balanceBefore.toNumber()).to.equal(10e6);

    await usdx.connect(borrower).transfer(offChainAsset.address, investAmount);
    st = offChainAsset.connect(borrower);
    await st.borrow(mintAmount);
    equity_ratio = await st.getEquityRatio();
    expect(equity_ratio.toNumber()).to.closeTo(100000, 5000); // expected 10%

    // Set Target Price to 1.01
    await sweep.setTargetPrice(1.01e6);

    equity_ratio = await st.getEquityRatio();
    expect(equity_ratio.toNumber()).to.closeTo(99108, 5000); // expected 10.98%    

    // Sell Sweep
    await st.sellSweepOnAMM(mintAmount, 0);
    equity_ratio = await st.getEquityRatio();
    expect(equity_ratio.toNumber()).to.closeTo(90590, 5000); // expected 18.96%

    // Set Target Price to 1.02
    targetPrice = await sweep.targetPrice();
    await sweep.setTargetPrice(1.02e6);

    equity_ratio = await st.getEquityRatio();
    expect(equity_ratio.toNumber()).to.closeTo(81586, 5000); // expected -18.99%
  });
});

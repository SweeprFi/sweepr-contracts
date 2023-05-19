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
      addresses.approver,
      2500 // 0.25%
    ]);
    sweep = await Proxy.deployed();

    Token = await ethers.getContractFactory("USDCMock");
    usdx = await Token.deploy();

    USDOracle = await ethers.getContractFactory("AggregatorMock");
    usdOracle = await USDOracle.deploy();

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address, usdOracle.address, Const.ADDRESS_ZERO);

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
    await sweep.addMinter(offChainAsset.address, maxBorrow);
    await usdx.transfer(amm.address, usdxAmount);
    await sweep.transfer(amm.address, sweepAmount);
    await usdx.transfer(borrower.address, investAmount);
    await usdx.approve(offChainAsset.address, usdxAmount);
    await offChainAsset.connect(borrower).configure(
      Const.RATIO,
      Const.SPREAD_FEE,
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
    expect(equity_ratio.toNumber()).to.equal(100000); // expected 10%

    // Set Target Price to 0.9
    target_price = await sweep.target_price();
    await sweep.setTargetPrice(target_price, 0.9e6);

    equity_ratio = await st.getEquityRatio();
    expect(equity_ratio.toNumber()).to.equal(109890); // expected 10.98%    

    // Sell Sweep
    await st.sellSweepOnAMM(mintAmount, 0);
    equity_ratio = await st.getEquityRatio();
    expect(equity_ratio.toNumber()).to.equal(187807); // expected 18.78%

    // Set Target Price to 1.2
    target_price = await sweep.target_price();
    await sweep.setTargetPrice(target_price, 1.2e6);

    equity_ratio = await st.getEquityRatio();
    expect(equity_ratio.toNumber()).to.equal(-82923); // expected -18.99%
  });
});

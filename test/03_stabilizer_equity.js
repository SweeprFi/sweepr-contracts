const { expect } = require("chai");
const { ethers } = require("hardhat");

contract("Test Equity Ratio of Stabilizer", async function () {
  before(async () => {
    [owner, borrower, wallet, treasury, multisig, lzEndpoint] = await ethers.getSigners();
    usdxAmount = 1000e6;
    sweepAmount = ethers.utils.parseUnits("1000", 18);
    maxBorrow = ethers.utils.parseUnits("100", 18);

    investAmount = 10e6;
    minimumEquityRatio = 1e4; // 1%
    mintAmount = ethers.utils.parseUnits("90", 18);
    spreadFee = 3e4; // 3%
    liquidatorDiscount = 2e4; // 2%
		callDelay = 432000; // 5 days
    autoInvestMinEquityRatio = 10e4; // 10%
    autoInvestMinAmount = ethers.utils.parseUnits("10", 18);
    autoInvest = true;
    ADDRESS_ZERO = ethers.constants.AddressZero;

    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
    sweep = await Proxy.deployed();

    Token = await ethers.getContractFactory("USDCMock");
    usdx = await Token.deploy();

    USDOracle = await ethers.getContractFactory("AggregatorMock");
    usdOracle = await USDOracle.deploy();

    Uniswap = await ethers.getContractFactory("UniswapMock");
    amm = await Uniswap.deploy(sweep.address, usdOracle.address, ADDRESS_ZERO);

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
    await usdx.connect(borrower).approve(offChainAsset.address, usdxAmount);

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

const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { time } = require('@openzeppelin/test-helpers');
const { expect } = require("chai");
let account;

contract.skip('Pegging - Local', async () => {
  before(async () => {
    // constants
    approver = '0x59490d4dcC479B3717A6Eb289Db929E125E86eB1'; // Approver BlackList
    multisig = addresses.multisig;
    sweepMaxMint = ethers.utils.parseUnits("10000", 18);
    sweepMintAmount = ethers.utils.parseUnits("5000", 18);
    sweepAmount = ethers.utils.parseUnits("3000", 18);
    usdxAmount = ethers.utils.parseUnits("3000", 6);
    ZERO = 0;

    // Contracts
    ERC20 = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
    Sweep = await ethers.getContractFactory("SweepDollarCoin");
    UniswapAsset = await ethers.getContractFactory("UniV3Asset");
    Pegging = await ethers.getContractFactory("Pegging");
    AMM = await ethers.getContractFactory("UniswapAMM");
    LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");

    // Deploys
    pegging = await Pegging.deploy(addresses.sweep, addresses.usdc);
    liquidityHelper = await LiquidityHelper.deploy();
    uniswap_asset = await UniswapAsset.deploy(
      'Uniswap Asset',
      addresses.sweep,
      addresses.usdc,
      liquidityHelper.address,
      addresses.uniswap_amm,
      addresses.owner
    );

    amm = await AMM.attach(addresses.uniswap_amm);
    usdc = await ERC20.attach(addresses.usdc);
    sweep = await Sweep.attach(addresses.sweep);

    // config
    await impersonate(sweep_owner);
    await sweep.connect(account).setTransferApprover(approver);
    existMinter = await sweep.isValidMinter(addresses.owner);
    if (!existMinter) {
      await sweep.connect(account).addMinter(addresses.owner, sweepMaxMint);
    } else {
      minter = await sweep.minters(addresses.owner);
      amount = minter.minted_amount.add(sweepMaxMint)
      await sweep.connect(account).setMinterMaxAmount(addresses.owner, amount);
    }
    await impersonate(addresses.usdc);
    await usdc.connect(account).transfer(addresses.owner, usdxAmount.mul(2));
  });

  ///////////// helper functions /////////////
  async function impersonate(address) {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [address]
    });

    account = await ethers.getSigner(address);
  }

  async function increaseTime() {
    await time.increase(86400);
    await time.advanceBlock();
  }

  async function isMintingAllowed() {
    ima = await sweep.is_minting_allowed();
    if (!ima) {
      amm_price = await sweep.amm_price();
      await impersonate(sweep_owner);
      await sweep.connect(account).setTargetPrice(amm_price, amm_price);
      await increaseTime();
    }
  }

  async function increaseTargetPrice() {
    await impersonate(sweep_owner);
    amm_price = await sweep.amm_price();
    new_target = parseInt(amm_price * 1.001, 10);
    await sweep.connect(account).setTargetPrice(new_target, new_target);
    await increaseTime();
  }
  //////////////////////////

  describe('main function', async () => {
    it('mints a new LP position', async () => {
      expect(await uniswap_asset.tokenId()).to.equal(ZERO);
      liquidityBefore = await uniswap_asset.liquidity();

      await increaseTime();
      await isMintingAllowed();
      await impersonate(addresses.owner);
      await sweep.connect(account).minter_mint(addresses.owner, sweepMintAmount);
      await usdc.connect(account).transfer(uniswap_asset.address, usdxAmount);
      await sweep.connect(account).transfer(uniswap_asset.address, sweepAmount);
      await uniswap_asset.connect(account).invest(usdxAmount, sweepAmount);

      liquidityAfter = await uniswap_asset.liquidity();
      expect(liquidityAfter).to.above(liquidityBefore);
    });

    it('unbalance the pool', async () => {
      await impersonate(addresses.owner);
      pool_address = addresses.uniswap_pool;
      uniV3_sweep_amount = await sweep.balanceOf(pool_address);
      sweepAmount = uniV3_sweep_amount.div(4);

      await sweep.connect(account).approve(amm.address, sweepAmount);
      await amm.connect(account).swapExactInput(addresses.sweep, addresses.usdc, sweepAmount, 0);
      await increaseTime();

      target_price = await sweep.target_price();
      amm_price = await sweep.amm_price();

      expect(target_price).to.above(amm_price);
      expect(await sweep.is_minting_allowed()).to.equal(false);
    });

    it('gets amount to peg correctly', async () => {
      tokenID = await uniswap_asset.tokenId();
      // rebalance the pool 
      amount_to_peg = await pegging.amountToPeg_UsingConstantProduct();
      amount_to_peg2 = await pegging.amountToPeg_UsingTicks(tokenID);
      await usdc.connect(account).approve(amm.address, amount_to_peg);
      await amm.connect(account).swapExactInput(addresses.usdc, addresses.sweep, amount_to_peg, 0);
      await increaseTime();

      target_price = await sweep.target_price();
      amm_price = await sweep.amm_price();
      minting_allowed = await sweep.is_minting_allowed();

      expect(minting_allowed).to.equal(true);
      expect(amm_price).to.above(target_price);

      // increases the sweep target price
      await increaseTargetPrice();
      minting_allowed = await sweep.is_minting_allowed();
      expect(minting_allowed).to.equal(false);

      // rebalance the pool 
      amount_to_peg = await pegging.amountToPeg_UsingConstantProduct();
      await impersonate(addresses.owner);
      // amount_to_peg = await pegging.amountToPeg_UsingTicks(tokenID);
      await usdc.connect(account).approve(amm.address, amount_to_peg);
      await amm.connect(account).swapExactInput(addresses.usdc, addresses.sweep, amount_to_peg, 0);
      await increaseTime();

      target_price = await sweep.target_price();
      amm_price = await sweep.amm_price();
      minting_allowed = await sweep.is_minting_allowed();

      expect(minting_allowed).to.equal(true);
      expect(amm_price).to.above(target_price);

      // increases the sweep target price
      await increaseTargetPrice();
      minting_allowed = await sweep.is_minting_allowed();
      expect(minting_allowed).to.equal(false);

      amount_to_peg = await pegging.amountToPeg_UsingConstantProduct();
      await impersonate(addresses.owner);
      // amount_to_peg = await pegging.amountToPeg_UsingTicks(tokenID);
      await usdc.connect(account).approve(amm.address, amount_to_peg);
      await amm.connect(account).swapExactInput(addresses.usdc, addresses.sweep, amount_to_peg, 0);
      await increaseTime();

      target_price = await sweep.target_price();
      amm_price = await sweep.amm_price();
      minting_allowed = await sweep.is_minting_allowed();

      expect(minting_allowed).to.equal(true);
      expect(amm_price).to.above(target_price);
    });
  });
});
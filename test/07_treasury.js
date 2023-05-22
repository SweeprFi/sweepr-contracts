const { ethers } = require("hardhat");
const { expect } = require('chai');
const { addresses } = require('../utils/address');

contract('Treasury', async () => {
  before(async () => {
    [owner, receiver, lzEndpoint] = await ethers.getSigners();
    ZERO = 0;
    usdxAmount = ethers.utils.parseUnits("1000", 6);

    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [
      lzEndpoint.address,
      addresses.owner,
      2500 // 0.25%
    ]);
    sweep = await Proxy.deployed();

    Token = await ethers.getContractFactory("USDCMock");
    usdx = await Token.deploy();

    Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(sweep.address);

    await usdx.transfer(treasury.address, usdxAmount);
  })

  describe('transfers and sends ETH', async () => {
    it('transfers and sends 1 ETH', async () => {
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(ZERO);
      eth_balance = await ethers.provider.getBalance(receiver.address);
      deposit_ethAmount = ethers.utils.parseEther("1");

      await owner.sendTransaction({ to: treasury.address, value: deposit_ethAmount });
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(deposit_ethAmount);

      await expect(treasury.connect(lzEndpoint).sendEth(receiver.address, deposit_ethAmount))
        .to.be.revertedWithCustomError(treasury, "OnlyAdmin");
      await treasury.sendEth(receiver.address, deposit_ethAmount);

      expect(await ethers.provider.getBalance(treasury.address)).to.equal(ZERO);
      expect(await ethers.provider.getBalance(receiver.address)).to.equal(eth_balance.add(deposit_ethAmount));
    });

    it('transfers 1 ETH and sends with over amount than balance', async () => {
      eth_balance = await ethers.provider.getBalance(receiver.address);
      await owner.sendTransaction({ to: treasury.address, value: deposit_ethAmount });
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(deposit_ethAmount);

      withdraw_ethAmount = ethers.utils.parseEther("2");
      await treasury.sendEth(receiver.address, withdraw_ethAmount);

      expect(await ethers.provider.getBalance(treasury.address)).to.equal(ZERO);
      expect(await ethers.provider.getBalance(receiver.address)).to.equal(eth_balance.add(deposit_ethAmount));
    });
  });

  describe('transfers and sends ERC20 token', async () => {
    it('Transfer and sends 10 USDC', async () => {
      deposit_usdxAmount = ethers.utils.parseUnits("10", 6);

      expect(await usdx.balanceOf(treasury.address)).to.equal(usdxAmount);
      expect(await usdx.balanceOf(receiver.address)).to.equal(ZERO);

      await expect(treasury.connect(lzEndpoint).sendToken(usdx.address, receiver.address, deposit_usdxAmount))
        .to.be.revertedWithCustomError(treasury, "OnlyAdmin");

      await treasury.sendToken(usdx.address, receiver.address, deposit_usdxAmount);

      expect(await usdx.balanceOf(treasury.address)).to.equal(usdxAmount.sub(deposit_usdxAmount));
      expect(await usdx.balanceOf(receiver.address)).to.equal(deposit_usdxAmount);
    });

    it('sends all balance', async () => {
      await treasury.sendToken(usdx.address, receiver.address, usdxAmount);

      expect(await usdx.balanceOf(treasury.address)).to.equal(ZERO);
      expect(await usdx.balanceOf(receiver.address)).to.equal(usdxAmount);
    });
  });
});

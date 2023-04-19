const { ethers } = require("hardhat");
const { expect } = require('chai');

contract('Treasury - Local', async () => {
  before(async () => {
    [owner, lzEndpoint] = await ethers.getSigners();
    ZERO = 0;

    // ------------- Deployment of contracts -------------
    Sweep = await ethers.getContractFactory("SweepMock");
    const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
    sweep = await Proxy.deployed();

    Token = await ethers.getContractFactory("USDCMock");
    usdx = await Token.deploy();

    Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(sweep.address);

    usdxAmount = ethers.utils.parseUnits("1000", 6);
    usdx.transfer(owner.address, usdxAmount);
    await usdx.approve(treasury.address, usdxAmount);
  })

  describe('transfers and withdraws ETH', async () => {
    it('transfers and withdraws 1 ETH', async () => {
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(ZERO);
      deposit_ethAmount = ethers.utils.parseEther("1");
      await owner.sendTransaction({to: treasury.address, value: deposit_ethAmount});
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(deposit_ethAmount);

      await treasury.recoverEth(deposit_ethAmount);
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(ZERO);
    });

    it('transfers 1 ETH and withdraws with over amount than balance', async () => {
      await owner.sendTransaction({to: treasury.address, value: deposit_ethAmount});
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(deposit_ethAmount);

      withdraw_ethAmount = ethers.utils.parseEther("2");
      await treasury.recoverEth(withdraw_ethAmount);
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(ZERO);
    });
  });

  describe('transfers and withdraws ERC20 token', async () => {
    it('Transfer and withdraws 10 USDC', async () => {
      expect(await usdx.balanceOf(treasury.address)).to.equal(ZERO);
      deposit_usdxAmount = ethers.utils.parseUnits("10", 6);
      calldata = usdx.interface.encodeFunctionData("transferFrom", [owner.address, treasury.address, deposit_usdxAmount]);
      await treasury.execute(usdx.address, calldata);
      expect(await usdx.balanceOf(treasury.address)).to.equal(deposit_usdxAmount);

      calldata = usdx.interface.encodeFunctionData("transfer", [owner.address, deposit_usdxAmount]);
      await treasury.execute(usdx.address, calldata);
      expect(await usdx.balanceOf(treasury.address)).to.equal(ZERO);
    });

    it('cannot withdraw with over amount than balance', async () => {
      calldata = usdx.interface.encodeFunctionData("transferFrom", [owner.address, treasury.address, deposit_usdxAmount]);
      await treasury.execute(usdx.address, calldata);
      withdraw_usdxAmount = ethers.utils.parseUnits("20", 6);
      calldata = usdx.interface.encodeFunctionData("transfer", [owner.address, withdraw_usdxAmount]);
      await expect(treasury.execute(usdx.address, calldata))
              .to.be.revertedWith('ERC20: transfer amount exceeds balance');
    });
  });
});

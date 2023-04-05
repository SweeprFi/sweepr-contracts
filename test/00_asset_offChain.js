const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");

contract("Off-Chain Asset - Local", async function (accounts) {
    before(async () => {
        GUEST = accounts[0];
        WALLET = accounts[8];
        BORROWER = addresses.borrower;

        ZERO = 0;
        sweepAmount = ethers.utils.parseUnits("100", 18);
        usdxAmount = 100e6;

        // ------------- Deployment of contracts -------------
        Token = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
        usdx = await Token.attach(addresses.usdc);

        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep);
        sweep = await Proxy.deployed();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, usdx.address);

        OffChainAsset = await ethers.getContractFactory("OffChainAsset");
        asset = await OffChainAsset.deploy(
            'OffChain Asset',
            sweep.address,
            addresses.usdc,
            WALLET,
            amm.address,
            BORROWER
        );
    });

    async function impersonate(account) {
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [account]
        });

        user = await ethers.getSigner(account);
    }

    describe("main functions", async function () {
        it('deposit usdc and sweep to the asset', async () => {
            await impersonate(addresses.usdc);
            await usdx.connect(user).transfer(asset.address, usdxAmount);
            await sweep.transfer(asset.address, sweepAmount);
            expect(await usdx.balanceOf(asset.address)).to.equal(usdxAmount);
            expect(await sweep.balanceOf(asset.address)).to.equal(sweepAmount);
        });

        it("invests correctly", async function () {
            await impersonate(GUEST);
            expect(await asset.assetValue()).to.equal(ZERO);
            expect(await asset.valuation_time()).to.equal(ZERO);
            await expect(asset.connect(user).invest(usdxAmount, sweepAmount))
                .to.be.revertedWithCustomError(asset, 'OnlyBorrower');

            await impersonate(BORROWER);
            await asset.connect(user).invest(usdxAmount, sweepAmount);
            expect(await asset.assetValue()).to.above(ZERO);
            expect(await usdx.balanceOf(WALLET)).to.equal(usdxAmount);
            expect(await sweep.balanceOf(WALLET)).to.equal(sweepAmount);
        });

        it("divests correctly", async function () {
            await impersonate(GUEST);
            await expect(asset.connect(user).divest(usdxAmount))
                .to.be.revertedWithCustomError(asset, 'OnlyBorrower');

            await impersonate(BORROWER);
            await asset.connect(user).divest(usdxAmount);
            expect(await asset.redeem_amount()).to.equal(usdxAmount);
            expect(await asset.redeem_mode()).to.equal(true);
            expect(await asset.redeem_time()).to.above(ZERO);
        });

        it("returns investment correctly", async function () {
            await impersonate(WALLET);
            await usdx.connect(user).approve(asset.address, usdxAmount);
            await asset.connect(user).payback(addresses.usdc, usdxAmount);

            expect(await asset.redeem_mode()).to.equal(false);
            expect(await asset.redeem_amount()).to.equal(ZERO);
        });
    });
});

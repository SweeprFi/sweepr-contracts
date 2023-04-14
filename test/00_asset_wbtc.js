const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");

contract("WBTC Asset - Local", async function () {
    before(async () => {
        depositAmount = 10e6;
        withdrawAmount = 15e6;
        ZERO = 0;
        BORROWER = addresses.multisig;

        // ------------- Deployment of contracts -------------
        Token = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
        usdc = await Token.attach(addresses.usdc);
        wbtc = await Token.attach(addresses.wbtc);

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        WBTCAsset = await ethers.getContractFactory("TokenAsset");
        wbtc_asset = await WBTCAsset.deploy(
            'WBTC Asset',
            addresses.sweep,
            addresses.usdc,
            addresses.wbtc,
            addresses.oracle_wbtc_usd,
            addresses.uniswap_amm,
            BORROWER,
            usdOracle.address
        );
    });

    async function impersonate(account) {
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [account]
        });

        user = await ethers.getSigner(account);
    }

    describe("asset constraints", async function () {
        it("only borrower can inveset", async function () {
            await expect(wbtc_asset.invest(depositAmount)).to.be.revertedWithCustomError(wbtc_asset, 'OnlyBorrower');
        });

        it("only borrower can divest", async function () {
            await expect(wbtc_asset.divest(depositAmount)).to.be.revertedWithCustomError(wbtc_asset, 'OnlyBorrower');
        });
    });

    describe("invest and divest functions", async function () {
        it('deposit usdc to the asset', async () => {
            await impersonate(addresses.usdc);
            await usdc.connect(user).transfer(wbtc_asset.address, depositAmount);
            expect(await usdc.balanceOf(wbtc_asset.address)).to.equal(depositAmount)
        });

        it("invest correctly", async function () {
            await impersonate(BORROWER);
            expect(await wbtc_asset.assetValue()).to.equal(ZERO);
            await wbtc_asset.connect(user).invest(depositAmount);
            expect(await usdc.balanceOf(wbtc_asset.address)).to.equal(ZERO);
            expect(await wbtc.balanceOf(wbtc_asset.address)).to.above(ZERO);
        });

        it("divest correctly", async function () {
            await wbtc_asset.connect(user).divest(withdrawAmount);
            expect(await usdc.balanceOf(wbtc_asset.address)).to.above(ZERO);
            expect(await wbtc.balanceOf(wbtc_asset.address)).to.equal(ZERO);
        });
    });
});

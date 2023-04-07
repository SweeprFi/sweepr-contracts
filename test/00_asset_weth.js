const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
let user;

contract("WETH Asset - Local", async function () {
    before(async () => {
        depositAmount = 10e6;
        withdrawAmount = 15e6;
        ZERO = 0;
        BORROWER = addresses.multisig;

        // ------------- Deployment of contracts -------------
        Token = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
        usdc = await Token.attach(addresses.usdc);
        weth = await Token.attach(addresses.weth);

        WETHAsset = await ethers.getContractFactory("TokenAsset");
        weth_asset = await WETHAsset.deploy(
            'WETH Asset',
            addresses.sweep,
            addresses.usdc,
            addresses.weth,
            addresses.oracle_weth_usd,
            addresses.uniswap_amm,
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

    describe("asset constraints", async function () {
        it("only borrower can inveset", async function () {
            await expect(weth_asset.invest(depositAmount)).to.be.revertedWithCustomError(weth_asset, 'OnlyBorrower');
        });

        it("only borrower can divest", async function () {
            await expect(weth_asset.divest(depositAmount)).to.be.revertedWithCustomError(weth_asset, 'OnlyBorrower');
        });
    });

    describe("invest and divest functions", async function () {
        it('deposit usdc to the asset', async () => {
            await impersonate(addresses.usdc);
            await usdc.connect(user).transfer(weth_asset.address, depositAmount);
            expect(await usdc.balanceOf(weth_asset.address)).to.equal(depositAmount)
        });

        it("invest correctly", async function () {
            await impersonate(BORROWER);
            expect(await weth_asset.assetValue()).to.equal(ZERO);
            await weth_asset.connect(user).invest(depositAmount);
            expect(await usdc.balanceOf(weth_asset.address)).to.equal(ZERO);
            expect(await weth.balanceOf(weth_asset.address)).to.above(ZERO);
        });

        it("divest correctly", async function () {
            await weth_asset.connect(user).divest(withdrawAmount);
            expect(await usdc.balanceOf(weth_asset.address)).to.above(ZERO);
            expect(await weth.balanceOf(weth_asset.address)).to.equal(ZERO);
        });
    });
});

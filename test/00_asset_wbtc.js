const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { impersonate,sendEth } = require("../utils/helper_functions");

contract("WBTC Asset - Local", async function () {
    before(async () => {
        [borrower, other, treasury, lzEndpoint] = await ethers.getSigners();
        depositAmount = 10e6;
        withdrawAmount = 15e6;
        ZERO = 0;
        BORROWER = borrower.address;
        maxSweep = ethers.utils.parseUnits("500000", 18);
        maxBorrow = ethers.utils.parseUnits("100", 8);
        WBTC_HOLDER = '0x489ee077994b6658eafa855c308275ead8097c4a';
        ADDRESS_ZERO = ethers.constants.AddressZero;

        await sendEth(WBTC_HOLDER);
        // ------------- Deployment of contracts -------------
        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
        sweep = await Proxy.deployed();
        await sweep.setTreasury(treasury.address);

        Token = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
        usdc = await Token.attach(addresses.usdc);
        wbtc = await Token.attach(addresses.wbtc);

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, usdOracle.address, ADDRESS_ZERO);
        await amm.setPrice(28e9);

        WBTCAsset = await ethers.getContractFactory("TokenAsset");
        wbtc_asset = await WBTCAsset.deploy(
            'WBTC Asset',
            sweep.address,
            addresses.usdc,
            addresses.wbtc,
            addresses.oracle_wbtc_usd,
            amm.address,
            BORROWER
        );

        // simulates a pool in uniswap with 10000 SWEEP/USDX
        await sweep.addMinter(BORROWER, maxSweep);
        await sweep.minter_mint(amm.address, maxBorrow);

        user = await impersonate(addresses.usdc)
        await usdc.connect(user).transfer(amm.address, 100e6);

        user = await impersonate(WBTC_HOLDER);
        await wbtc.connect(user).transfer(amm.address, maxBorrow);
    });

    describe("asset constraints", async function () {
        it("only borrower can inveset", async function () {
            await expect(wbtc_asset.connect(other).invest(depositAmount))
                .to.be.revertedWithCustomError(wbtc_asset, 'OnlyBorrower');
        });

        it("only borrower can divest", async function () {
            await expect(wbtc_asset.connect(other).divest(depositAmount))
                .to.be.revertedWithCustomError(wbtc_asset, 'OnlyBorrower');
        });
    });

    describe("invest and divest functions", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc);
            await usdc.connect(user).transfer(wbtc_asset.address, depositAmount);
            expect(await usdc.balanceOf(wbtc_asset.address)).to.equal(depositAmount)
        });

        it("invest correctly", async function () {
            expect(await wbtc_asset.assetValue()).to.equal(ZERO);
            await wbtc_asset.invest(depositAmount);
            expect(await usdc.balanceOf(wbtc_asset.address)).to.equal(ZERO);
            expect(await wbtc.balanceOf(wbtc_asset.address)).to.above(ZERO);
        });

        it("divest correctly", async function () {
            await wbtc_asset.divest(withdrawAmount);
            expect(await usdc.balanceOf(wbtc_asset.address)).to.above(ZERO);
            expect(await wbtc.balanceOf(wbtc_asset.address)).to.equal(ZERO);
        });
    });
});

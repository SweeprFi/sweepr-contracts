const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses, chainId } = require("../../../utils/address");
const { impersonate, Const, sendEth, increaseTime, getBlockTimestamp } = require("../../../utils/helper_functions")

contract('sFrax Asset', async () => {
    if (Number(chainId) !== 1) return;

    before(async () => {
        [owner, lzEndpoint] = await ethers.getSigners();

        BORROWER = owner.address;
        USDC_ADDRESS = addresses.usdc;
        USDC_HOLDER = addresses.usdc_holder;
        USDX_ORACLE = addresses.oracle_usdc_usd;
        FRAX_ORACLE = addresses.oracle_frax_usd;
        FRAX_ADDRESS = addresses.frax;
        S_FRAX_ADDRESS = addresses.sfrax;

        depositAmount = 100000e6;
        investAmount = 60000e6;

        // Sweep Contract
        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, owner.address, 2500]);
        sweep = await Proxy.deployed();
        usdx = await ethers.getContractAt("ERC20", USDC_ADDRESS);

        sFrax = await ethers.getContractAt("IERC4626", S_FRAX_ADDRESS);
        LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
        liquidityHelper = await LiquidityHelper.deploy();

        Uniswap = await ethers.getContractFactory("UniswapAMM");
        amm = await Uniswap.deploy(
            sweep.address,
            USDC_ADDRESS,
            addresses.sequencer_feed,
            Const.FEE,
            USDX_ORACLE,
            86400,
            liquidityHelper.address
        );

        Asset = await ethers.getContractFactory("SFraxAsset");
        asset = await Asset.deploy(
            "sFrax Asset",
            sweep.address, // SWEEP
            USDC_ADDRESS, // USDC
            FRAX_ADDRESS,
            S_FRAX_ADDRESS,
            USDX_ORACLE,
            FRAX_ORACLE,
            Const.FEE,
            BORROWER
        );
                
        await sweep.setAMM(amm.address);
        await sendEth(BORROWER);
        await sendEth(USDC_HOLDER);
    });

    describe("Initial Test", async function () {
        it('invest into sFrax', async () => {
            user = await impersonate(USDC_HOLDER);
            await usdx.connect(user).transfer(asset.address, depositAmount);

            await asset.invest(investAmount, Const.SLIPPAGE);
            expect(await asset.assetValue()).to.above(Const.ZERO);
            expect(await sFrax.balanceOf(asset.address)).to.be.above(0);

            await asset.invest(investAmount, Const.SLIPPAGE);

            await expect(asset.invest(investAmount, Const.SLIPPAGE))
                .to.be.revertedWithCustomError(asset, "NotEnoughBalance");
        });

        it('divest from sFrax', async () => {
            await asset.divest(investAmount, Const.SLIPPAGE);
            expect(await usdx.balanceOf(asset.address)).to.be.above(depositAmount * 0,95);
        });
    });
});

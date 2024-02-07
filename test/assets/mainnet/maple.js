const { ethers } = require('hardhat');
const { expect } = require("chai");
const { network, tokens, chainlink, uniswap, protocols, wallets } = require("../../../utils/constants");
const { impersonate, Const, sendEth, increaseTime, getBlockTimestamp } = require("../../../utils/helper_functions")

contract('Maple Asset', async () => {
    if (Number(network.id) !== 1) return;

    before(async () => {
        [owner, lzEndpoint] = await ethers.getSigners();

        BORROWER = owner.address;
        USDC_ADDRESS = tokens.usdc;
        SWEEP_ADDRESS = tokens.sweep;
        USDC_HOLDER = wallets.usdc_holder;
        ORACLE = chainlink.usdc_usd;
        POOL_DELEGATE = "0x8c8C2431658608F5649B8432764a930c952d8A98";
        POOL_MANAGER = protocols.maple.poolManager;
        MAPLE_POOL = protocols.maple.usdcPool;
        WITHDRAWAL_MANAGER = protocols.maple.withdrawalManager;

        depositAmount = 100000e6;
        investAmount = 60000e6;

        // Sweep Contract
        sweep = await ethers.getContractAt("SweepCoin", SWEEP_ADDRESS);
        usdx = await ethers.getContractAt("ERC20", USDC_ADDRESS);
        maplePool = await ethers.getContractAt("IMaplePool", MAPLE_POOL);
        mapleManager = await ethers.getContractAt("IMapplePoolManager", POOL_MANAGER);
        mapleWithdrawal = await ethers.getContractAt("IWithdrawalManager", WITHDRAWAL_MANAGER);
        LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
        liquidityHelper = await LiquidityHelper.deploy();

        Uniswap = await ethers.getContractFactory("UniswapAMM");
        amm = await Uniswap.deploy(
            SWEEP_ADDRESS,
            USDC_ADDRESS,
            chainlink.sequencer,
            uniswap.pool_sweep,
            chainlink.usdc_usd,
            86400,
            liquidityHelper.address,
            uniswap.router
        );

        Asset = await ethers.getContractFactory("MapleAsset");
        asset = await Asset.deploy(
            "Maple Asset",
            sweep.address, // SWEEP
            USDC_ADDRESS, // USDC
            MAPLE_POOL, // MAPLE'S ERC4626 POOL
            ORACLE,
            WITHDRAWAL_MANAGER, // MAPLE WITHDRAWAL MANAGER
            BORROWER
        );

        OWNER = await sweep.owner();
        await sendEth(OWNER);
        await sendEth(USDC_HOLDER);
        SWEEP_OWNER = await impersonate(OWNER);
        await sweep.connect(SWEEP_OWNER).setAMM(amm.address);
    });

    describe("Initial Test", async function () {
        it('invest into Maple pool', async () => {
            user = await impersonate(USDC_HOLDER);
            await usdx.connect(user).transfer(asset.address, depositAmount);

            user = await impersonate(POOL_DELEGATE);
            await mapleManager.connect(user).setAllowedLender(asset.address, true);
            expect(await asset.assetValue()).to.equal(Const.ZERO);

            await asset.invest(investAmount);
            expect(await asset.assetValue()).to.above(Const.ZERO);

            await asset.invest(investAmount);

            await expect(asset.invest(investAmount))
                .to.be.revertedWithCustomError(asset, "NotEnoughBalance");
        });

        it('divest from the Maple pool', async () => {
            initalValue = await asset.assetValue();
            // Delay 1 year
            await increaseTime(Const.DAY * 365);
            newValue = await asset.assetValue();
            expect(newValue).to.be.greaterThan(initalValue);

            await asset.requestRedeem(newValue);

            expect(await mapleWithdrawal.lockedShares(asset.address)).to.above(0);
            expect(await usdx.balanceOf(asset.address)).to.equal(0);

            // moves between the Maple window time
            id = await mapleWithdrawal.exitCycleId(asset.address);
            info = await mapleWithdrawal.getWindowAtId(id);
            now = await getBlockTimestamp();

            time = info.windowStart_.sub(now)
            await increaseTime(time.toNumber());
            await asset.divest(1);

            expect(await mapleWithdrawal.lockedShares(asset.address)).to.equal(0);
            expect(await usdx.balanceOf(asset.address)).to.above(depositAmount);
        });
    });
});

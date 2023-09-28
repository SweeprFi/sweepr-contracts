const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses, chainId } = require("../utils/address");
const { impersonate, Const, sendEth, increaseTime } = require("../utils/helper_functions")

contract.only('Maple Asset', async () => {
    // Maple Asset only work on the Ethereum mainnet.
    if (Number(chainId) !== 1) return;

    before(async () => {
        [owner, lzEndpoint] = await ethers.getSigners();

        BORROWER = owner.address;
        USDC_ADDRESS = addresses.usdc;
        USDC_HOLER = addresses.usdc_holder;
        ORACLE_MAPLE = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6";
        POOL_DELEGATE = "0x8c8C2431658608F5649B8432764a930c952d8A98"

        depositAmount = 100000e6;
        investAmount = 60000e6;
        
        // Sweep Contract
        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address, owner.address, 2500]);
        sweep = await Proxy.deployed();
        usdx = await ethers.getContractAt("ERC20", USDC_ADDRESS);
        maplePool = await ethers.getContractAt("IMaplePool", "0xfe119e9C24ab79F1bDd5dd884B86Ceea2eE75D92");
        mapleManager = await ethers.getContractAt("IMapplePoolManager", "0x219654a61a0bc394055652986be403fa14405bb8");
        mapleWithdrawal = await ethers.getContractAt("IWithdrawalManager", "0x1146691782c089bCF0B19aCb8620943a35eebD12");

        Uniswap = await ethers.getContractFactory("UniswapAMM");
        amm = await Uniswap.deploy(
            sweep.address,
            USDC_ADDRESS,
            addresses.sequencer_feed,
            Const.FEE,
            addresses.oracle_usdc_usd,
            86400
        );

        Asset = await ethers.getContractFactory("MapleAsset");
        asset = await Asset.deploy(
            "Maple Asset",
            sweep.address, // SWEEP
            USDC_ADDRESS, // USDC
            "0xfe119e9C24ab79F1bDd5dd884B86Ceea2eE75D92", // MAPLE'S ERC4626 POOL
            "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", // USDC-USD ORACLE
            "0x1146691782c089bCF0B19aCb8620943a35eebD12", // MAPLE WITHDRAWAL MANAGER
            BORROWER
        );

        await sweep.setAMM(amm.address);
        await sendEth(BORROWER);
        await sendEth(USDC_HOLER);
    });

    describe("Initial Test", async function () {
        it('deposit usdc to the asset', async () => {
            expect(await asset.currentValue()).to.equal(Const.ZERO);

            user = await impersonate(USDC_HOLER);
            await usdx.connect(user).transfer(asset.address, depositAmount);

            expect(await usdx.balanceOf(asset.address)).to.equal(depositAmount)
            expect(await asset.currentValue()).to.above(Const.ZERO);
        });

        it('invest into Maple pool', async () => {
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

            await increaseTime(Const.DAY*30);
            await asset.divest(investAmount);

            // expect(await asset.assetValue()).to.above(assetVal);

            // // Divest usdx
            // await expect(asset.divest(divestAmount))
            //     .to.be.revertedWithCustomError(asset, 'NotBorrower');
            // await asset.divest(divestAmount);
            // expect(await asset.assetValue()).to.above(Const.ZERO);
            
            // divestAmount = 250e6;
            // await asset.divest(divestAmount);
            // expect(await asset.assetValue()).to.equal(Const.ZERO);
        });
    });
});

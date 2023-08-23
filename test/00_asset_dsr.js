const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses, chainId } = require("../utils/address");
const { impersonate, Const, sendEth, increaseTime } = require("../utils/helper_functions")

contract('DSR Asset', async () => {
    // DSR Asset only work on the Ethereum mainnet.
    if (Number(chainId) !== 1) return;

    before(async () => {
        [owner, lzEndpoint] = await ethers.getSigners();

        BORROWER = addresses.multisig;
        depositAmount = 200e6;
        investAmount = 100e6;
        divestAmount = 150e6;
        
        // Sweep Contract
        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [
            lzEndpoint.address,
            addresses.owner,
            2500 // 0.25%
        ]);
        sweep = await Proxy.deployed();

        // Token Contract
        ERC20 = await ethers.getContractFactory("ERC20");
        usdx = await ERC20.attach(addresses.usdc);
        dai = await ERC20.attach(addresses.dai);

        // Uniswap Contract
        Uniswap = await ethers.getContractFactory("UniswapAMM");
        amm = await Uniswap.deploy(
            sweep.address,
            addresses.usdc,
            addresses.sequencer_feed,
            Const.FEE,
            addresses.oracle_dai_usd,
            86400
        );
        await sweep.setAMM(amm.address);

        // DSR Contract
        Asset = await ethers.getContractFactory("DsrAsset");
        asset = await Asset.deploy(
            'DSR Asset',
            sweep.address,
            addresses.usdc,
            addresses.dai,
            addresses.dsr_manager,
            addresses.dss_psm,
            addresses.oracle_usdc_usd,
            addresses.oracle_dai_usd,
            BORROWER
        );

        await sendEth(BORROWER)
    });

    describe("Initial Test", async function () {
        it('deposit usdc to the asset', async () => {
            expect(await asset.currentValue()).to.equal(Const.ZERO);
            user = await impersonate(addresses.usdc_holder);
            await sendEth(user.address);
            await usdx.connect(user).transfer(asset.address, depositAmount);
            expect(await usdx.balanceOf(asset.address)).to.equal(depositAmount)
            expect(await asset.currentValue()).to.above(Const.ZERO);
        });

        it('invest to the DSR', async () => {
            await expect(asset.invest(depositAmount, 0))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');

            user = await impersonate(BORROWER);
            expect(await asset.assetValue()).to.equal(Const.ZERO);
            await asset.connect(user).invest(investAmount, Const.SLIPPAGE);
            expect(await asset.assetValue()).to.above(Const.ZERO);

            await asset.connect(user).invest(depositAmount, Const.SLIPPAGE);

            await expect(asset.connect(user).invest(depositAmount, 0))
                .to.be.revertedWithCustomError(asset, "NotEnoughBalance");
        });

        it('divest to the DSR', async () => {
            assetVal = await asset.assetValue();
            
            // Delay 5 days
            await increaseTime(Const.DAY * 5);
            
            await asset.dsrDaiBalance();
            expect(await asset.assetValue()).to.above(assetVal);

            // Divest usdx
            await expect(asset.divest(divestAmount, 0))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
            await asset.connect(user).divest(depositAmount, Const.SLIPPAGE);

            expect(await asset.assetValue()).to.equal(Const.ZERO);
        });
    });
});

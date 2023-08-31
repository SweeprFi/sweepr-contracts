const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses, chainId } = require("../utils/address");
const { impersonate, sendEth, Const } = require("../utils/helper_functions")

contract('GLP Asset', async () => {
    // GLP Asset only work on the Arbitrum.
    if (Number(chainId) !== 42161) return;

    before(async () => {
        [lzEndpoint] = await ethers.getSigners();
        BORROWER = addresses.multisig;
        depositAmount = 200e6;
        investAmount = 100e6;
        divestAmount = 150e6;
        slippage = 50000;
        glpPrice = 0.95e6;
        
        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [
            lzEndpoint.address,
            addresses.owner,
            2500 // 0.25%
        ]);
        sweep = await Proxy.deployed();
        user = await impersonate(addresses.owner);
        await sweep.connect(user).setTreasury(addresses.treasury);

        ERC20 = await ethers.getContractFactory("ERC20");
        usdx = await ERC20.attach(addresses.usdc);

        Oracle = await ethers.getContractFactory("AggregatorMock");
        wethOracle = await Oracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(amm.address);

        await amm.setPrice(Const.WETH_PRICE);
        await wethOracle.setPrice(Const.WETH_PRICE);

        Asset = await ethers.getContractFactory("GlpAsset");
        asset = await Asset.deploy(
            'GLP Asset',
            sweep.address,
            addresses.usdc,
            addresses.glp_reward_router,
            addresses.oracle_usdc_usd,
            wethOracle.address,
            addresses.multisig
        );

        reward_token_address = await asset.rewardToken();
        reward_token = await ERC20.attach(reward_token_address);
    });

    describe("Initial Test", async function () {
        it('deposit usdc to the asset', async () => {
            expect(await asset.currentValue()).to.equal(Const.ZERO);
            user = await impersonate(addresses.usdc_holder);
            await sendEth(user.address);
            await usdx.connect(user).transfer(asset.address, depositAmount);
            expect(await usdx.balanceOf(asset.address)).to.above(Const.ZERO)
        });

        it('invest and divest to the GMX', async () => {
            await expect(asset.invest(depositAmount, glpPrice, slippage))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');

            user = await impersonate(BORROWER);
            expect(await asset.assetValue()).to.equal(Const.ZERO);
            await asset.connect(user).invest(investAmount, 0, slippage);
            expect(await asset.assetValue()).to.above(Const.ZERO);

            await asset.connect(user).invest(depositAmount, glpPrice, slippage);

            await expect(asset.connect(user).invest(depositAmount, glpPrice, slippage))
                .to.be.revertedWithCustomError(asset, "NotEnoughBalance");

            // Collect Reward
            await asset.connect(user).collect();

            // Divest usdx
            await expect(asset.divest(divestAmount, glpPrice, slippage))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
            assetValue = await asset.assetValue();
            await asset.connect(user).divest(divestAmount, 0, slippage);

            expect(await asset.assetValue()).to.not.greaterThan(assetValue);
            await asset.connect(user).divest(divestAmount, glpPrice, slippage);
        });
    });
});

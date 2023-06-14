const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses, chainId } = require("../utils/address");
const { impersonate, Const, increaseTime } = require("../utils/helper_functions")

contract('GLP Asset', async () => {
    // GLP Asset only work on the Arbitrum.
    if (Number(chainId) !== 42161) return;

    before(async () => {
        [lzEndpoint] = await ethers.getSigners();
        BORROWER = addresses.multisig;
        depositAmount = 100e6;
        divestAmount = 200e6;

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
        usdOracle = await Oracle.deploy();
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
            wethOracle.address,
            addresses.multisig
        );

        reward_token_address = await asset.rewardToken();
        reward_token = await ERC20.attach(reward_token_address);
    });

    describe("Initial Test", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc);
            await usdx.connect(user).transfer(asset.address, depositAmount);
            expect(await usdx.balanceOf(asset.address)).to.equal(depositAmount)
        });

        it('invest and divest to the GMX', async () => {
            await expect(asset.invest(depositAmount))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');

            user = await impersonate(BORROWER);
            expect(await asset.assetValue()).to.equal(Const.ZERO);
            await asset.connect(user).invest(depositAmount);
            expect(await asset.assetValue()).to.above(Const.ZERO);

            // Collect Reward
            // expect(await reward_token.balanceOf(user.address)).to.equal(Const.ZERO);
            // await asset.connect(user).collect();
            // expect(await reward_token.balanceOf(user.address)).to.above(Const.ZERO);

            // Divest usdx
            await expect(asset.divest(divestAmount))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
            await asset.connect(user).divest(divestAmount);

            expect(await asset.assetValue()).to.equal(Const.ZERO);
        });
    });
});

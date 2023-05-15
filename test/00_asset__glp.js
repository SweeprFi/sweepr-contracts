const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses, chainId } = require("../utils/address");
const { impersonate, Const } = require("../utils/helper_functions")

contract('GLP Asset', async () => {
    // GLP Asset only work on the Arbitrum.
    if (Number(chainId) !== 42161) return;

    before(async () => {
        [lzEndpoint] = await ethers.getSigners();
        BORROWER = addresses.multisig;
        depositAmount = 100e6;
        divestAmount = 200e6;

        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
        sweep = await Proxy.deployed();
        await sweep.setTreasury(addresses.treasury);

        ERC20 = await ethers.getContractFactory("ERC20");
        usdx = await ERC20.attach(addresses.usdc);

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, usdOracle.address, Const.ADDRESS_ZERO);

        Asset = await ethers.getContractFactory("GlpAsset");
        asset = await Asset.deploy(
            'GLP Asset',
            sweep.address,
            addresses.usdc,
            addresses.glp_reward_router,
            addresses.oracle_weth_usd,
            amm.address,
            addresses.multisig
        );

        reward_token_address = await asset.reward_token();
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
                .to.be.revertedWithCustomError(asset, 'OnlyBorrower');

            user = await impersonate(BORROWER);
            expect(await asset.assetValue()).to.equal(Const.ZERO);
            await asset.connect(user).invest(depositAmount);
            expect(await asset.assetValue()).to.above(Const.ZERO);

            // Collect Reward
            expect(await reward_token.balanceOf(user.address)).to.equal(Const.ZERO);
            await asset.connect(user).collect();
            expect(await reward_token.balanceOf(user.address)).to.above(Const.ZERO);

            // Divest usdx
            await expect(asset.divest(divestAmount))
                .to.be.revertedWithCustomError(asset, 'OnlyBorrower');
            await asset.connect(user).divest(divestAmount);

            expect(await asset.assetValue()).to.equal(Const.ZERO);
        });
    });
});

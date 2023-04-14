const { ethers } = require('hardhat');
const { expect } = require("chai");
const { time } = require('@openzeppelin/test-helpers');
const { addresses, chainId } = require("../utils/address");

contract('GLP Asset - Local', async () => {
    // GLP Asset only work on the Arbitrum.
    if (Number(chainId) !== 42161) return;

    // Variables
    ZERO = 0;
    depositAmount = 100e6;
    divestAmount = 200e6;

    before(async () => {
        [guest, lzEndpoint] = await ethers.getSigners();
        BORROWER = addresses.multisig;

        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
        sweep = await Proxy.deployed();
        await sweep.setTreasury(addresses.treasury);

        ERC20 = await ethers.getContractFactory("contracts/Common/ERC20/ERC20.sol:ERC20");
        usdx = await ERC20.attach(addresses.usdc);

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address);

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Asset = await ethers.getContractFactory("GlpAsset");
        asset = await Asset.deploy(
            'GLP Asset',
            sweep.address,
            addresses.usdc,
            addresses.glp_reward_router,
            addresses.oracle_weth_usd,
            amm.address,
            addresses.multisig,
            usdOracle.address
        );

        reward_token_address = await asset.reward_token();
        reward_token = await ERC20.attach(reward_token_address);
    });

    // impersonate accounts
    async function impersonate(account) {
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [account]
        });
        user = await ethers.getSigner(account);
    }

    describe("Initial Test", async function () {
        it('deposit usdc to the asset', async () => {
            await impersonate(addresses.usdc);
            await usdx.connect(user).transfer(asset.address, depositAmount);
            expect(await usdx.balanceOf(asset.address)).to.equal(depositAmount)
        });

        it('invest and divest to the GMX', async () => {
            await impersonate(BORROWER);
            // Invest usdx
            expect(await asset.assetValue()).to.equal(ZERO);
            await expect(asset.connect(guest).invest(depositAmount))
                .to.be.revertedWithCustomError(asset, 'OnlyBorrower');
            await asset.connect(user).invest(depositAmount);

            expect(await asset.assetValue()).to.above(ZERO);

            // Delay 5 days
            await time.increase(432000);
            await time.advanceBlock();

            // Collect Reward
            expect(await reward_token.balanceOf(user.address)).to.equal(ZERO);
            await asset.connect(user).collect();
            expect(await reward_token.balanceOf(user.address)).to.above(ZERO);

            // Divest usdx
            await expect(asset.connect(guest).divest(divestAmount))
                .to.be.revertedWithCustomError(asset, 'OnlyBorrower');
            await asset.connect(user).divest(divestAmount);

            expect(await asset.assetValue()).to.equal(ZERO);
        });
    });
});

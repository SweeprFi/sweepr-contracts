const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses, chainId } = require("../utils/address");
const { sendEth, impersonate, increaseTime, Const, toBN } = require("../utils/helper_functions");

contract('Compound V2 Asset', async () => {
    // Compound only work on the ethereum mainnet due to oracle.
    if (Number(chainId) > 1) return;

    // Variables
    maxBorrow = toBN("100", 18);
    depositAmount = 100e6;
    divestAmount = 200e6;

    before(async () => {
        [guest, lzEndpoint] = await ethers.getSigners();

        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [lzEndpoint.address]);
        sweep = await Proxy.deployed();

        ERC20 = await ethers.getContractFactory("ERC20");
        usdx = await ERC20.attach(addresses.usdc);
        comp = await ERC20.attach(addresses.comp);

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, usdOracle.address, Const.ADDRESS_ZERO);

        CompoundAsset = await ethers.getContractFactory("CompV2Asset");
        compAsset = await CompoundAsset.deploy(
            'Compound Asset',
            sweep.address,
            addresses.usdc,
            addresses.comp,
            addresses.comp_cusdc,
            addresses.comp_control,
            amm.address,
            addresses.multisig
        );

        BORROWER = addresses.multisig;

        await sendEth(BORROWER);

        // config stabilizer
        user = await impersonate(BORROWER);
        await compAsset.connect(user).configure(
            Const.RATIO,
            Const.SPREAD_FEE,
            maxBorrow,
            Const.DISCOUNT,
            Const.DAYS_5,
            Const.RATIO,
            maxBorrow,
            Const.TRUE,
            Const.URL
        );
    });

    describe("Initial Test", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc);
            await usdx.connect(user).transfer(compAsset.address, depositAmount);
            expect(await usdx.balanceOf(compAsset.address)).to.equal(depositAmount)
        });

        it('invest and divest to the Comp', async () => {
            user = await impersonate(BORROWER);
            // Invest usdx
            expect(await compAsset.assetValue()).to.equal(Const.ZERO);
            await expect(compAsset.connect(guest).invest(depositAmount))
                .to.be.revertedWithCustomError(compAsset, 'OnlyBorrower');
            await compAsset.connect(user).invest(depositAmount);
            expect(await compAsset.assetValue()).to.above(Const.ZERO);

            // Delay 100 days
            await increaseTime(Const.DAY*100);

            // Collect Reward
            expect(await comp.balanceOf(user.address)).to.equal(Const.ZERO);
            await compAsset.connect(user).collect();
            expect(await comp.balanceOf(user.address)).to.above(Const.ZERO);

            // Divest usdx
            await expect(compAsset.connect(guest).divest(divestAmount))
                .to.be.revertedWithCustomError(compAsset, 'OnlyBorrower');
            await compAsset.connect(user).divest(divestAmount);
            expect(await compAsset.assetValue()).to.equal(Const.ZERO);
        });
    });
});

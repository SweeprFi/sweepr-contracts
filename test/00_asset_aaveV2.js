const { ethers } = require('hardhat');
const { expect } = require("chai");
const { addresses, chainId } = require("../utils/address");
const { sendEth, impersonate, Const, toBN } = require("../utils/helper_functions");

contract('Aave V2 Asset', async () => {
    // Test contract only on the ethereum mainnet due to some libraries.
    if (Number(chainId) > 1) return;

    // Variables
    maxBorrow = toBN("100", 18);
    depositAmount = 100e6;
    divestAmount = 200e6;
    autoInvestAMount = toBN("10", 18);

    before(async () => {
        [guest, lzEndpoint] = await ethers.getSigners();

        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [
            lzEndpoint.address,
            addresses.owner,
            2500 // 0.25%
        ]);
        sweep = await Proxy.deployed();

        ERC20 = await ethers.getContractFactory("ERC20");
        usdx = await ERC20.attach(addresses.usdc);

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, usdOracle.address, Const.ADDRESS_ZERO);
        
        AaveAsset = await ethers.getContractFactory("AaveAsset");
        aaveAsset = await AaveAsset.deploy(
            'Aave Asset',
            sweep.address,
            addresses.usdc,
            addresses.aave_usdc,
            addresses.aaveV2_pool,
            amm.address,
            addresses.multisig
        );

        BORROWER = addresses.multisig;

        await sendEth(BORROWER);

        // config stabilizer
        user = await impersonate(BORROWER);
        await aaveAsset.connect(user).configure(
            Const.RATIO,
            Const.SPREAD_FEE,
            maxBorrow,
            Const.DISCOUNT,
            Const.DAYS_5,
            Const.RATIO,
            autoInvestAMount,
            Const.TRUE,
            Const.URL
        );
    });

    describe("Initial Test", async function () {
        it('deposit usdc to the asset', async () => {
            user = await impersonate(addresses.usdc);
            await usdx.connect(user).transfer(aaveAsset.address, depositAmount);
            expect(await usdx.balanceOf(aaveAsset.address)).to.equal(depositAmount)
        });

        it('invest and divest to the Comp', async () => {
            user = await impersonate(BORROWER);
            // Invest usdx
            expect(await aaveAsset.assetValue()).to.equal(Const.ZERO);
            await expect(aaveAsset.connect(guest).invest(depositAmount))
                .to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).invest(depositAmount);
            expect(await aaveAsset.assetValue()).to.above(Const.ZERO);

            // Delay 100 days
            await increaseTime(Const.DAY*100);

            // Divest usdx
            await expect(aaveAsset.connect(guest).divest(divestAmount)) 
                .to.be.revertedWithCustomError(aaveAsset, 'OnlyBorrower');
            await aaveAsset.connect(user).divest(divestAmount);
            expect(await aaveAsset.assetValue()).to.equal(Const.ZERO);
        });
    });
});

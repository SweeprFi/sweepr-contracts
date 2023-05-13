const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { impersonate } = require("../utils/helper_functions");

contract.skip('Uniswap V3 Asset - Local', async () => {
    before(async () => {
        [guest] = await ethers.getSigners();

        ZERO = 0;
        sweepAmount = ethers.utils.parseUnits("100", 18);
        usdxAmount = 100e6;
        mintLPSweepAmount = ethers.utils.parseUnits("10", 18);
        mintLPUsdxAmount = 10e6;
        increaseLPSweepAmount = ethers.utils.parseUnits("50", 18);
        increaseLPUsdxAmount = 50e6;
        maxBorrow = ethers.utils.parseUnits("100", 18);
        minEquityRatio = 10e4; // 10%
        spreadFee = 3e4; // 3%
        liquidatorDiscount = 2e4; // 2%
        callDelay = 432000; // 5 days
        autoInvestMinEquityRatio = 10e4; // 10%
        autoInvestMinAmount = ethers.utils.parseUnits("10", 18);
        autoInvest = true;

        BORROWER = addresses.multisig;

        Sweep = await ethers.getContractFactory("SweepDollarCoin");
        sweep = await Sweep.attach(addresses.sweep);

        ERC20 = await ethers.getContractFactory("ERC20");
        usdx = await ERC20.attach(addresses.usdc);

        LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
        liquidityHelper = await LiquidityHelper.deploy();

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        UniV3Asset = await ethers.getContractFactory("UniV3Asset");
        asset = await UniV3Asset.deploy(
            'Uniswap Asset',
            addresses.sweep,
            addresses.usdc,
            liquidityHelper.address,
            addresses.uniswap_amm,
            BORROWER,
            usdOracle.address
        );

        OWNER = await sweep.owner();
        user = await impersonate(OWNER);
        // add asset as a minter
        ima = await sweep.is_minting_allowed();
        if (!ima) {
            amm_price = await sweep.amm_price();
            await sweep.connect(user).setTargetPrice(amm_price, amm_price);
        }
        await sweep.connect(user).addMinter(asset.address, sweepAmount);

        user = await impersonate(BORROWER);
        // config stabilizer
        await asset.connect(user).configure(
            minEquityRatio,
            spreadFee,
            maxBorrow,
            liquidatorDiscount,
            callDelay,
            autoInvestMinEquityRatio,
            autoInvestMinAmount,
            autoInvest,
            "htttp://test.com"
        );
    });

    describe("main functions", async function () {
        it('deposit usdc to the asset', async () => {
            expect(await usdx.balanceOf(asset.address)).to.equal(ZERO);
            await usdx.connect(user).transfer(asset.address, usdxAmount);
            expect(await usdx.balanceOf(asset.address)).to.equal(usdxAmount);
        });

        it('borrow sweep', async () => {
            await expect(asset.connect(guest).borrow(sweepAmount))
                .to.be.revertedWithCustomError(asset, 'OnlyBorrower');
            expect(await asset.sweep_borrowed()).to.equal(ZERO);
            await asset.connect(user).borrow(sweepAmount);
            expect(await asset.sweep_borrowed()).to.equal(sweepAmount);
        });

        it('check LP token minted', async () => {
            await expect(asset.connect(user).divest(usdxAmount))
                .to.be.revertedWithCustomError(asset, 'NotMinted');
            await expect(asset.connect(user).collect())
                .to.be.revertedWithCustomError(asset, 'NotMinted');

            // Check retrieveNFT
            let owner = await ethers.getSigner(OWNER);
            await expect(asset.connect(owner).retrieveNFT())
                .to.be.revertedWithCustomError(asset, 'NotMinted');
        });

        it('mint LP token', async () => {
            expect(await asset.assetValue()).to.equal(ZERO);
            expect(await asset.liquidity()).to.equal(ZERO);
            expect(await asset.tokenId()).to.equal(ZERO);

            await asset.connect(user).invest(mintLPUsdxAmount, mintLPSweepAmount);

            expect(await asset.tokenId()).to.not.equal(ZERO);
            expect(await asset.liquidity()).to.above(ZERO);
        });

        it('increases liquidity', async () => {
            liquidity = await asset.liquidity();

            await asset.connect(user).invest(increaseLPUsdxAmount, increaseLPSweepAmount);

            expect(await asset.liquidity()).to.above(liquidity);
        });

        it('withdraws rewards', async () => {
            await expect(asset.connect(guest).collect())
                .to.be.revertedWithCustomError(asset, 'OnlyBorrower');
            await asset.connect(user).collect();
        });

        it('removes liquidity', async () => {
            liquidity = await asset.liquidity();
            withdrawAmount = liquidity.div(2);
            await expect(asset.connect(guest).divest(withdrawAmount))
                .to.be.revertedWithCustomError(asset, 'OnlyBorrower');
            await asset.connect(user).divest(withdrawAmount);
        });

        it('retrieve LP token', async () => {
            await expect(asset.connect(guest).retrieveNFT())
                .to.be.revertedWithCustomError(asset, 'OnlyAdmin');

            expect(await asset.tokenId()).to.not.equal(ZERO);
            let owner = await ethers.getSigner(OWNER);
            await asset.connect(owner).retrieveNFT();
            expect(await asset.tokenId()).to.equal(ZERO);
        });
    })
});

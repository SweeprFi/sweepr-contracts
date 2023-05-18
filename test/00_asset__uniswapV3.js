const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { toBN, Const } = require("../utils/helper_functions");

let pool_address;

contract.skip('Uniswap V3 Asset', async () => {
    before(async () => {
        [borrower, guest, lzEndpoint] = await ethers.getSigners();

        usdxAmount = 1000e6;
        mintLPUsdxAmount = 100e6;
        increaseLPUsdxAmount = 500e6;
        sweepAmount = ethers.utils.parseUnits("1000", 18);
        mintLPSweepAmount = ethers.utils.parseUnits("100", 18);
        increaseLPSweepAmount = ethers.utils.parseUnits("500", 18);
        BORROWER = borrower.address;

        Sweep = await ethers.getContractFactory("SweepMock");
        const Proxy = await upgrades.deployProxy(Sweep, [
            lzEndpoint.address,
            addresses.owner,
            2500 // 0.25%
        ]);
        sweep = await Proxy.deployed();

        ERC20 = await ethers.getContractFactory("USDCMock");
        usdc = await ERC20.deploy();

        LiquidityHelper = await ethers.getContractFactory("LiquidityHelper");
        liquidityHelper = await LiquidityHelper.deploy();

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, usdOracle.address, Const.ADDRESS_ZERO);

        factory = await ethers.getContractAt("IUniswapV3Factory", addresses.uniswap_factory);
        positionManager = await ethers.getContractAt("INonfungiblePositionManager", Const.NFT_POSITION_MANAGER);

        UniV3Asset = await ethers.getContractFactory("UniV3Asset");
        asset = await UniV3Asset.deploy(
            'Uniswap Asset',
            sweep.address,
            usdc.address,
            liquidityHelper.address,
            amm.address,
            BORROWER
        );

        await sweep.addMinter(asset.address, sweepAmount);
        // config stabilizer
        await asset.configure(
            Const.RATIO,
            Const.SPREAD_FEE,
            sweepAmount,
            Const.DISCOUNT,
            Const.DAY,
            Const.RATIO,
            sweepAmount,
            Const.FALSE,
            Const.URL
        );
    });

    describe("main functions", async function () {
        it('creates the pool', async () => {
            expect(await factory.getPool(usdc.address, sweep.address, 500)).to.equal(Const.ADDRESS_ZERO);

            let token0, token1;
            const sqrtPriceX96 = toBN("79243743360848080207210863491", 6);

            if (usdc.address < sweep.address) {
                token0 = usdc.address;
                token1 = sweep.address;
            } else {
                token0 = sweep.address;
                token1 = usdc.address;
            }

            await positionManager.createAndInitializePoolIfNecessary(token0, token1, 500, sqrtPriceX96)
            pool_address = await factory.getPool(usdc.address, sweep.address, 500);

            expect(pool_address).to.not.equal(Const.ADDRESS_ZERO);
        });

        it('deposit usdc to the asset', async () => {
            expect(await usdc.balanceOf(asset.address)).to.equal(Const.ZERO);
            await usdc.transfer(asset.address, usdxAmount);
            expect(await usdc.balanceOf(asset.address)).to.equal(usdxAmount);
        });

        it('borrow sweep', async () => {
            await expect(asset.connect(guest).borrow(sweepAmount))
                .to.be.revertedWithCustomError(asset, 'OnlyBorrower');
            expect(await asset.sweep_borrowed()).to.equal(Const.ZERO);
            await asset.borrow(sweepAmount);
            expect(await asset.sweep_borrowed()).to.equal(sweepAmount);
        });

        it('check LP token minted', async () => {
            await expect(asset.divest(usdxAmount))
                .to.be.revertedWithCustomError(asset, 'NotMinted');
            await expect(asset.collect())
                .to.be.revertedWithCustomError(asset, 'NotMinted');

            // Check retrieveNFT
            await expect(asset.retrieveNFT())
                .to.be.revertedWithCustomError(asset, 'NotMinted');
        });

        it('mint LP token', async () => {
            expect(await asset.assetValue()).to.equal(Const.ZERO);
            expect(await asset.liquidity()).to.equal(Const.ZERO);
            expect(await asset.tokenId()).to.equal(Const.ZERO);
            expect(await sweep.balanceOf(pool_address)).to.equal(Const.ZERO);
            expect(await usdc.balanceOf(pool_address)).to.equal(Const.ZERO);

            await asset.invest(mintLPUsdxAmount, mintLPSweepAmount);

            expect(await asset.tokenId()).to.not.equal(Const.ZERO);
            expect(await asset.liquidity()).to.above(Const.ZERO);
            expect(await sweep.balanceOf(pool_address)).to.above(Const.ZERO);
            expect(await usdc.balanceOf(pool_address)).to.above(Const.ZERO);
        });

        it('increases liquidity', async () => {
            liquidity = await asset.liquidity();
            balanceSweep = await sweep.balanceOf(pool_address);
            balanceUSDC = await usdc.balanceOf(pool_address);

            await asset.invest(increaseLPUsdxAmount, increaseLPSweepAmount);

            expect(await sweep.balanceOf(pool_address)).to.above(balanceSweep);
            expect(await usdc.balanceOf(pool_address)).to.above(balanceUSDC);
            expect(await asset.liquidity()).to.above(liquidity);
        });

        it('withdraws rewards', async () => {
            await expect(asset.connect(guest).collect())
                .to.be.revertedWithCustomError(asset, 'OnlyBorrower');
            await asset.collect();
        });

        it('removes liquidity', async () => {
            liquidity = await asset.liquidity();
            withdrawAmount = liquidity.div(2);
            await expect(asset.connect(guest).divest(withdrawAmount))
                .to.be.revertedWithCustomError(asset, 'OnlyBorrower');
            await asset.divest(withdrawAmount);
        });

        it('retrieve LP token', async () => {
            expect(await asset.tokenId()).to.not.equal(Const.ZERO);
            await expect(asset.connect(guest).retrieveNFT())
                .to.be.revertedWithCustomError(asset, 'NotGovernance');
            await asset.retrieveNFT();
            expect(await asset.tokenId()).to.equal(Const.ZERO);
        });
    })
});

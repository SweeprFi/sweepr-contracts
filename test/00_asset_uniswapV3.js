const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require('../utils/address');
const { toBN, Const } = require("../utils/helper_functions");

let pool_address;

contract('Uniswap V3 Asset', async () => {
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

        Uniswap = await ethers.getContractFactory("UniswapMock");
        amm = await Uniswap.deploy(sweep.address, Const.FEE);
        await sweep.setAMM(amm.address);

        factory = await ethers.getContractAt("IUniswapV3Factory", addresses.uniswap_factory);
        positionManager = await ethers.getContractAt("INonfungiblePositionManager", addresses.uniV3Positions);

        UniV3Asset = await ethers.getContractFactory("UniV3Asset");
        asset = await UniV3Asset.deploy(
            'Uniswap Asset',
            sweep.address,
            usdc.address,
            liquidityHelper.address,
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
            expect(await factory.getPool(usdc.address, sweep.address, Const.FEE)).to.equal(Const.ADDRESS_ZERO);

            let token0, token1;
            let sqrtPriceX96;

            if (usdc.address.toString().toLowerCase() < sweep.address.toString().toLowerCase()) {
                token0 = usdc.address;
                token1 = sweep.address;
                sqrtPriceX96 = toBN("79228162514264337593543950336000000", 0);
                console.log("token0 - usdc:", usdc.address);
                console.log("token1 - sweep:", sweep.address);
            } else {
                token0 = sweep.address;
                token1 = usdc.address;
                sqrtPriceX96 = toBN("79228162514264334008320", 0);
                console.log("token0 - sweep:", sweep.address);
                console.log("token1 - usdc:", usdc.address);
            }

            await positionManager.createAndInitializePoolIfNecessary(token0, token1, Const.FEE, sqrtPriceX96)
            pool_address = await factory.getPool(usdc.address, sweep.address, Const.FEE);

            pool = await ethers.getContractAt("IUniswapV3Pool", pool_address);
            slot0 = await pool.slot0();

            expect(slot0.sqrtPriceX96).to.equal(sqrtPriceX96);
            expect(pool_address).to.not.equal(Const.ADDRESS_ZERO);
        });

        it('deposit usdc to the asset', async () => {
            expect(await usdc.balanceOf(asset.address)).to.equal(Const.ZERO);
            await usdc.transfer(asset.address, usdxAmount);
            expect(await usdc.balanceOf(asset.address)).to.equal(usdxAmount);
        });

        it('borrow sweep', async () => {
            await expect(asset.connect(guest).borrow(sweepAmount))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
            expect(await asset.sweep_borrowed()).to.equal(Const.ZERO);
            await asset.borrow(sweepAmount);
            expect(await asset.sweep_borrowed()).to.equal(sweepAmount);
        });

        it('check LP token minted', async () => {
            await expect(asset.divest(usdxAmount))
                .to.be.revertedWithCustomError(asset, 'NotMinted');
            await expect(asset.collect())
                .to.be.revertedWithCustomError(asset, 'NotMinted');

            await expect(asset.burnNFT())
                .to.be.revertedWithCustomError(asset, 'NotMinted');
        });

        it('mint LP token', async () => {
            expect(await asset.assetValue()).to.equal(Const.ZERO);
            expect(await asset.liquidity()).to.equal(Const.ZERO);
            expect(await asset.tokenId()).to.equal(Const.ZERO);
            expect(await sweep.balanceOf(pool_address)).to.equal(Const.ZERO);
            expect(await usdc.balanceOf(pool_address)).to.equal(Const.ZERO);

            await asset.invest(mintLPUsdxAmount, mintLPSweepAmount);

            console.log(await sweep.balanceOf(pool_address));
            console.log(await usdc.balanceOf(pool_address));

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
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
            await asset.collect();
        });

        it('removes liquidity', async () => {
            liquidity = await asset.liquidity();
            withdrawAmount = liquidity.div(2);
            await expect(asset.connect(guest).divest(withdrawAmount))
                .to.be.revertedWithCustomError(asset, 'NotBorrower');
            await asset.divest(withdrawAmount);
        });

        it('burn LP token', async () => {
            expect(await asset.tokenId()).to.not.equal(Const.ZERO);
            await expect(asset.connect(guest).burnNFT())
                .to.be.revertedWithCustomError(asset, 'NotBorrower');

            liquidity = await asset.liquidity();
            if(liquidity > 0) {
                await expect(asset.burnNFT()).to.be.revertedWith('Not cleared');
                await asset.divest(liquidity);
            }

            await asset.burnNFT();
            expect(await asset.tokenId()).to.equal(Const.ZERO);
        });
    })
});

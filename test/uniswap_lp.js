const { ethers } = require("hardhat");
const { tokens, deployments, wallets, chainlink } = require("../utils/constants");
const { impersonate, toBN, resetNetwork, sendEth, Const } = require("../utils/helper_functions");

contract("===============", async function () {
    before(async () => {
        [borrower] = await ethers.getSigners();
        await resetNetwork(175451864);

        MULTISIG = wallets.multisig;
        OWNER = wallets.owner;
        USDC_HOLDER = wallets.usdc_holder;
        POOL = deployments.uniswap_pool;

        sweep = await ethers.getContractAt("SweepCoin", tokens.sweep);
        usdc = await ethers.getContractAt("ERC20", tokens.usdc);
        amm = await ethers.getContractAt("UniswapAMM", deployments.uniswap_amm);

        // fund accounts =====================================
        await sendEth(MULTISIG);
        await sendEth(OWNER);
        await sendEth(USDC_HOLDER);
        multisig = await impersonate(MULTISIG);
        owner = await impersonate(OWNER);
        usdc_holder = await impersonate(USDC_HOLDER);
        // end =====================================

        // new MM depoyment ==================================
        market = await (await ethers.getContractFactory("UniswapMarketMaker")).deploy('UniMM', tokens.sweep, tokens.usdc, deployments.liquidity_helper, chainlink.usdc_usd, MULTISIG);
        sweep100000 = toBN("100000", 18);
        await usdc.connect(usdc_holder).transfer(market.address, 100e6);
        await market.connect(multisig).configure(2000, Const.spreadFee, sweep100000, Const.ZERO, Const.DAY, Const.RATIO, Const.ZERO, Const.ZERO, Const.TRUE, Const.FALSE, Const.URL);
        await market.connect(multisig).propose();
        await market.connect(multisig).setAMM(amm.address);
        await sweep.connect(multisig).addMinter(market.address, sweep100000);
        // end ==============================================
    });

    function pp(v, d) { return ethers.utils.formatUnits(v.toString(), d) }

    it("lp actions", async function () {
        sweep35 = toBN("35", 18);
        sweep90 = toBN("90", 18);

        console.log("INIT ===============================")
        console.log("POOL USDC:", pp(await usdc.balanceOf(POOL),6));
        console.log("POOL SWEEP:", pp(await sweep.balanceOf(POOL),18));
        console.log("MM USDC:", pp(await usdc.balanceOf(market.address),6));
        console.log("MM SWEEP:", pp(await sweep.balanceOf(market.address),18));

        await market.connect(multisig).lpGrow(sweep90, 1000, 1000000);

        console.log("\nGROW POSITION ===============================")
        console.log("POOL USDC:", pp(await usdc.balanceOf(POOL),6));
        console.log("POOL SWEEP:", pp(await sweep.balanceOf(POOL),18));
        console.log("MM USDC:", pp(await usdc.balanceOf(market.address),6));
        console.log("MM SWEEP:", pp(await sweep.balanceOf(market.address),18));

        await market.connect(multisig).lpRedeem(90e6, 1000, 1000000);

        console.log("\nREDEEM POSITION ===============================");
        console.log("POOL USDC:", pp(await usdc.balanceOf(POOL),6));
        console.log("POOL SWEEP:", pp(await sweep.balanceOf(POOL),18));
        console.log("MM USDC:", pp(await usdc.balanceOf(market.address),6));
        console.log("MM SWEEP:", pp(await sweep.balanceOf(market.address),18));

        // await market.connect(multisig).burnTradePosition();
        // await sweep.connect(owner).approve(amm.address, amount);
        // await amm.connect(owner).sellSweep(usdc.address, amount, minAmount);
        // await usdc.connect(usdc_holder).transfer(market.address, amount);
        // await market.connect(multisig).lpRedeem(amount, 15000, 2000);
        // await market.connect(multisig).lpTrade(usdxAmount,sweepAmount, 1000, 1000, 2000);
    });
});
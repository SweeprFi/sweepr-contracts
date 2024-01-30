const { ethers } = require("hardhat");
const { tokens, deployments, wallets, chainlink } = require("../../utils/constants");
const { impersonate, toBN, resetNetwork, sendEth, Const } = require("../../utils/helper_functions");

contract.skip("Uniswap Market Maker", async function () {
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
        market = await (await ethers.getContractFactory("UniswapMarketMaker"))
            .deploy('UniMM', tokens.sweep, tokens.usdc, deployments.liquidity_helper, chainlink.usdc_usd, MULTISIG);
        sweep100000 = toBN("100000", 18);
        await usdc.connect(usdc_holder).transfer(market.address, 100e6);
        await market.connect(multisig)
            .configure(2000, Const.spreadFee, sweep100000, Const.ZERO, Const.DAY, Const.RATIO, Const.ZERO, Const.ZERO, Const.TRUE, Const.FALSE, Const.URL);
        await market.connect(multisig).propose();
        await market.connect(multisig).setAMM(amm.address);
        await sweep.connect(multisig).addMinter(market.address, sweep100000);
        // end ==============================================
    });

    function pp(v, d) { return ethers.utils.formatUnits(v.toString(), d) }

    it("lp actions", async function () {
        sweep35 = toBN("35", 18);
        sweep50 = toBN("50", 18);
        usdc50 = toBN("50", 6);

        console.log("INIT ===============================")
        console.log("\tPOOL USDC:", pp(await usdc.balanceOf(POOL),6));
        console.log("\tPOOL SWEEP:", pp(await sweep.balanceOf(POOL),18));
        console.log("\tMM USDC:", pp(await usdc.balanceOf(market.address),6));
        console.log("\tMM SWEEP:", pp(await sweep.balanceOf(market.address),18));
        console.log("\tSWEEP AMM PRICE:", pp(await sweep.ammPrice(),6));
        console.log("\tSWEEP TARGET PRICE:", pp(await sweep.targetPrice(),6));

        await market.connect(multisig).lpGrow(sweep50, 1000, 1000);
        console.log("\nGROW POSITION ===============================")
        console.log(`\tAmount: ${pp(sweep50, 18)} SWEEP`)
        console.log("\tPOOL USDC:", pp(await usdc.balanceOf(POOL),6));
        console.log("\tPOOL SWEEP:", pp(await sweep.balanceOf(POOL),18));
        console.log("\tMM USDC:", pp(await usdc.balanceOf(market.address),6));
        console.log("\tMM SWEEP:", pp(await sweep.balanceOf(market.address),18));

        await market.connect(multisig).lpRedeem(usdc50, 1000, 1000);
        console.log("\nREDEEM POSITION ===============================");
        console.log(`\tAmount: ${pp(usdc50, 18)} USDC`)
        console.log("\tPOOL USDC:", pp(await usdc.balanceOf(POOL),6));
        console.log("\tPOOL SWEEP:", pp(await sweep.balanceOf(POOL),18));
        console.log("\tMM USDC:", pp(await usdc.balanceOf(market.address),6));
        console.log("\tMM SWEEP:", pp(await sweep.balanceOf(market.address),18));

        await market.connect(multisig).lpTrade(usdc50, sweep50, 50000, 2000, 1e5);
        console.log("\nTRADE POSITION ===============================");
        console.log(`\tAmount: ${pp(usdc50, 6)} USDC ~ ${pp(sweep50, 18)} SWEEP`)
        console.log("\tPOOL USDC:", pp(await usdc.balanceOf(POOL),6));
        console.log("\tPOOL SWEEP:", pp(await sweep.balanceOf(POOL),18));
        console.log("\tMM USDC:", pp(await usdc.balanceOf(market.address),6));
        console.log("\tMM SWEEP:", pp(await sweep.balanceOf(market.address),18));
    });
});
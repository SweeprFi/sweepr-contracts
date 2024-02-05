const { ethers } = require("hardhat");
const { tokens, deployments, wallets, chainlink, network } = require("../../utils/constants");
const { impersonate, toBN, resetNetwork, sendEth, Const } = require("../../utils/helper_functions");

contract("Pancake Market Maker", async function () {
    return;
    if (Number(network.id) !== 56) return;
    before(async () => {
        [borrower] = await ethers.getSigners();
        await resetNetwork(35880349);

        MULTISIG = wallets.multisig;
        OWNER = wallets.owner;
        USDT_HOLDER = wallets.usdt_holder;
        POOL = deployments.pancake_pool;

        sweep = await ethers.getContractAt("SweepCoin", tokens.sweep);
        usdt = await ethers.getContractAt("ERC20", tokens.usdt);
        amm = await ethers.getContractAt("PancakeAMM", deployments.pancake_amm);

        // fund accounts =====================================
        await sendEth(MULTISIG);
        await sendEth(OWNER);
        await sendEth(USDT_HOLDER);
        multisig = await impersonate(MULTISIG);
        owner = await impersonate(OWNER);
        usdt_holder = await impersonate(USDT_HOLDER);
        // end =====================================

        // new MM depoyment ==================================
        market = await (await ethers.getContractFactory("PancakeMarketMaker"))
            .deploy('PancakeMM', tokens.sweep, tokens.usdt, deployments.liquidity_helper, chainlink.usdt_usd, MULTISIG);
        sweep100000 = toBN("100000", 18);
        await usdt.connect(usdt_holder).transfer(market.address, 100e6);
        await market.connect(multisig)
            .configure(2000, Const.spreadFee, sweep100000, Const.ZERO, Const.DAY, Const.RATIO, Const.ZERO, Const.ZERO, Const.TRUE, Const.FALSE, Const.URL);
        await market.connect(multisig).propose();
        await market.connect(multisig).setAMM(amm.address);
        await sweep.connect(multisig).addMinter(market.address, sweep100000);
        // end ==============================================
    });

    function pp(v, d) { return ethers.utils.formatUnits(v.toString(), d) }

    it("lp actions", async function () {
        sweep35 = toBN("100", 18);
        sweep50 = toBN("50", 18);
        usdc50 = toBN("50", 18);

        // isMintingAllowed: false ==================================
        isMintingAllowed = await sweep.isMintingAllowed();
        if(!isMintingAllowed) {
            usdt100 = toBN("400", 18);
            sweepMin = toBN("380", 18);
            await usdt.connect(usdt_holder).approve(amm.address, usdt100);
            await amm.connect(usdt_holder).buySweep(usdt.address, usdt100, sweepMin);
        }
        // end ==============================================
        await usdt.connect(usdt_holder).transfer(market.address, sweep35);

        console.log("INIT ===============================")
        console.log("\tPOOL USDT:", pp(await usdt.balanceOf(POOL),18));
        console.log("\tPOOL SWEEP:", pp(await sweep.balanceOf(POOL),18));
        console.log("\tMM USDT:", pp(await usdt.balanceOf(market.address),18));
        console.log("\tMM SWEEP:", pp(await sweep.balanceOf(market.address),18));
        console.log("\tSWEEP AMM PRICE:", pp(await sweep.ammPrice(),6));
        console.log("\tSWEEP TARGET PRICE:", pp(await sweep.targetPrice(),6));

        await market.connect(multisig).lpGrow(sweep50, 5, 1000);
        console.log("\nGROW POSITION ===============================")
        console.log(`\tAmount: ${pp(sweep50, 18)} SWEEP`)
        console.log("\tPOOL USDT:", pp(await usdt.balanceOf(POOL),18));
        console.log("\tPOOL SWEEP:", pp(await sweep.balanceOf(POOL),18));
        console.log("\tMM USDT:", pp(await usdt.balanceOf(market.address),18));
        console.log("\tMM SWEEP:", pp(await sweep.balanceOf(market.address),18));

        await market.connect(multisig).lpRedeem(usdc50, 5, 1000);
        console.log("\nREDEEM POSITION ===============================");
        console.log(`\tAmount: ${pp(usdc50, 18)} USDT`)
        console.log("\tPOOL USDT:", pp(await usdt.balanceOf(POOL),18));
        console.log("\tPOOL SWEEP:", pp(await sweep.balanceOf(POOL),18));
        console.log("\tMM USDT:", pp(await usdt.balanceOf(market.address),18));
        console.log("\tMM SWEEP:", pp(await sweep.balanceOf(market.address),18));

        await market.connect(multisig).lpTrade(usdc50, sweep50, 2000, 1e5, 1e5);
        console.log("\nTRADE POSITION ===============================");
        console.log(`\tAmount: ${pp(usdc50, 18)} USDT ~ ${pp(sweep50, 18)} SWEEP`)
        console.log("\tPOOL USDT:", pp(await usdt.balanceOf(POOL),18));
        console.log("\tPOOL SWEEP:", pp(await sweep.balanceOf(POOL),18));
        console.log("\tMM USDT:", pp(await usdt.balanceOf(market.address),18));
        console.log("\tMM SWEEP:", pp(await sweep.balanceOf(market.address),18));
    });
});
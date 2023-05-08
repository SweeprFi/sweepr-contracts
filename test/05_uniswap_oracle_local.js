const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");

contract('Uniswap Oracle - Local', async () => {
    before(async () => {
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [sweep_owner]
        });

        admin = await ethers.getSigner(sweep_owner);

        USDOracle = await ethers.getContractFactory("AggregatorMock");
        usdOracle = await USDOracle.deploy();

        Oracle = await ethers.getContractFactory("UniswapOracle");
        oracle = await Oracle.connect(admin).deploy(
            addresses.sweep,
            addresses.uniswap_pool,
            addresses.oracle_usdc_usd,
            addresses.sequencer_feed
        );
    });

    it('fetches data from the oracle and toggles the tokens', async () => {
        dataBefore = await oracle.token_symbols();
        await oracle.connect(admin).toggleTokenForPricing();
        dataAfter = await oracle.token_symbols();

        expect(dataBefore[0]).to.equal(dataAfter[1]);
        expect(dataBefore[1]).to.equal(dataAfter[0]);
    });

    it('fetches the price', async () => {
        price = await oracle.getPrice();
        expect(price).to.above(0);
    });

    it('fetches the pool liquidity correctly', async () => {
        liquidity = await oracle.getLiquidity();
        expect(liquidity.sweep_amount).to.above(0);
        expect(liquidity.usdx_amount).to.above(0);
    });

    it('fetches the unclaimed fee from pool correctly', async () => {
        unclaimed = await oracle.getUnclaimedFeeAmount();
        expect(unclaimed.sweep_amount).to.above(0);
        expect(unclaimed.usdx_amount).to.above(0);
    });
});

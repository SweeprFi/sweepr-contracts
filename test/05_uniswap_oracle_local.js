const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");

contract.only('Uniswap Oracle - Local', async () => {
    before(async () => {
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [sweep_owner]
        });

        admin = await ethers.getSigner(sweep_owner);

        Oracle = await ethers.getContractFactory("UniV3TWAPOracle");
        oracle = await Oracle.connect(admin).deploy(
            addresses.sweep,
            addresses.uniswap_pool,
            addresses.oracle_usdc_usd
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

    it('fetches amounts to call and invest correctly', async () => {
        invest_amount = await oracle.getPegAmountsForInvest();
        call_amount = await oracle.getPegAmountsForCall();

        expect(invest_amount).to.above(0);
        expect(call_amount).to.above(0);
    });
});

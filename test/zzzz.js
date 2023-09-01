const { expect } = require("chai");
const { ethers } = require("hardhat");
const { addresses, chainId } = require("../utils/address");
const { impersonate, Const, toBN, resetNetwork, sendEth } = require("../utils/helper_functions");

contract.only("USDPlus Asset", async function () {
    before(async () => {
        amount = toBN("3000", 18);
        slippage = Const.SLIPPAGE;
        sweepAddress = addresses.sweep;
        assetAddress = addresses.asset_usdPlus;
        ammAddress = addresses.uniswap_amm;
        borrower = addresses.multisig;

        // ------------- Deployment of contracts -------------
        sweep = await ethers.getContractAt("SweepCoin", sweepAddress);
        asset = await ethers.getContractAt("USDPlusAsset", assetAddress);
        amm = await ethers.getContractAt("UniswapAMM", ammAddress);
        
    });

    it("a ver si ahorra", async function () {
        user = await impersonate(borrower);
        await asset.connect(user).invest(amount, 1e6);
        console.log("paso paso");
    });
});

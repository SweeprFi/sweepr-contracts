const { expect } = require("chai");
const { ethers } = require("hardhat");
const { tokens, deployments, wallets } = require("../../utils/constants");
const { impersonate, sendEth, increaseTime, toBN, Const, getBlockTimestamp } = require("../../utils/helper_functions");

contract.skip("BalancerManualIR", async function () {
	before(async () => {
        sweep = await ethers.getContractAt("SweepCoin", tokens.sweep);
		balancer = await ethers.getContractAt("Balancer", deployments.balancer);

        await sendEth(wallets.multisig);
        multisig = await impersonate(wallets.multisig);
	});

	it('overrides IR', async () => {
        await log();

        targetInterestRate = 6; // 6%
        newNextPeriodStart = 1705967175;
        newDailyRate = parseInt(targetInterestRate * 1e8 / 365) + 1;
        console.log("New Daily Rate", newDailyRate);
        console.log("Setting IR to:", formatInterestRate(newDailyRate));
        console.log("At:", formatTimestamp(newNextPeriodStart));
        await balancer.connect(multisig).updateInterestRate(newDailyRate, newNextPeriodStart, { value: ethers.utils.parseEther("0.05") });

        await log();
	});
});

async function log() {
    console.log("==========================================================")
    console.log("CurrentPeriodStart:", formatTimestamp(await sweep.currentPeriodStart()));
    console.log("NextPeriodStart:", formatTimestamp(await sweep.nextPeriodStart()));
    console.log("CurrentInterestRate:", formatInterestRate(await sweep.currentInterestRate()));
    console.log("NextInterestRate:", formatInterestRate(await sweep.nextInterestRate()));
    console.log("CurrentTargetPrice:", formatPrice(await sweep.currentTargetPrice()));
    console.log("NextTargetPrice:", formatPrice(await sweep.nextTargetPrice()));
    console.log("StepValue:", formatInterestRate(await sweep.stepValue()));
    console.log("Period:", formatSeconds(await balancer.period()));
    console.log("==========================================================");

}

function formatSeconds(seconds) {
    s = parseInt(seconds.toString());
    r = parseInt(s / (60*60*24));
    return r + " days";
}

function formatPrice(price) {
    p = parseInt(price.toString()) / 1e6;
    return p + " USD";
}

function formatInterestRate(interestRate) {
    ir = parseInt(interestRate.toString()) * 365 / 1e8;
    return ir + " %" ;
}

function formatTimestamp(unix_timestamp) {
    var date = new Date(unix_timestamp * 1000);

    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    var day = date.getDate();
    var formattedDate = day + '/' + month + '/' + year;

    var hours = date.getHours();
    var minutes = "0" + date.getMinutes();
    var seconds = "0" + date.getSeconds();
    var formattedTime = hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);

    return formattedDate + " " + formattedTime;
}

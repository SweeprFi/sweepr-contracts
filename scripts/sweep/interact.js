const { ethers } = require("hardhat");
const readline = require('readline');
const { addresses } = require('../../utils/address');

async function main() {
  let txn;
  const owner = addresses.multisig;

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [owner],
  });

  const admin = await ethers.getSigner(owner);
  const _sweep = await ethers.getContractFactory("SweepCoin");
  const sweep = await _sweep.attach(addresses.sweep);

  function greenlog(msg) { console.log(`\x1b[32m${msg}\x1b[0m`) }
  function redlog(msg) { console.log(`\x1b[31m${msg}\x1b[0m`) }
  function pp(v, d) { return ethers.utils.formatUnits(v.toString(), d) }

  function ask(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    return new Promise(resolve => rl.question(query, ans => {
      rl.close();
      resolve(ans);
    }))
  }

  async function state() {
    console.log("\nStatus");
    console.log("------------------------------------------");
    console.log("       interest rate:", pp(await sweep.interest_rate(), 4), "%");
    console.log("          step value:", pp(await sweep.step_value(), 4), "%");
    console.log("        period start:", pp(await sweep.period_start(), 0));
    console.log("         period time:", pp(await sweep.period_time(), 0));
    console.log("current target price:", pp(await sweep.current_target_price(), 6), "usd");
    console.log("   next target price:", pp(await sweep.next_target_price(), 6), "usd");
    console.log("          arb spread:", pp(await sweep.arb_spread() ,4) , "%");
    console.log("------------------------------------------");
    greenlog("ok");
  }

  async function config() {
    console.log("\nConfig");
    console.log("------------------------------------------");
    console.log("               admin:", await sweep.owner());
    console.log("            balancer:", await sweep.balancer());
    console.log("            treasury:", await sweep.treasury());
    console.log("------------------------------------------");
    greenlog("ok");
  }

  async function pause() {
    txn = await sweep.connect(admin).pause();
    await txn.wait();
    greenlog("ok");
  }

  async function unpause() {
    txn = await sweep.connect(admin).unpause();
    await txn.wait();
    greenlog("ok");
  }

  async function addMinter(minter, amount) {
    const sweepAmount = ethers.utils.parseUnits(amount, 18);
    txn = await sweep.connect(admin).addMinter(minter, sweepAmount);
    await txn.wait();
    greenlog("ok");
  }

  async function setPeriodTime(days) {
    const periodTime = days * 24 * 3600;
    txn = await sweep.connect(admin).setPeriodTime(periodTime);
    await txn.wait();
    greenlog("ok");
  }

  async function setInterest(percent) {
    const rate = percent * 1e4;
    txn = await sweep.connect(admin).setInterestRate(rate);
    await txn.wait();
    greenlog("ok");
  }

  async function exit() {
    greenlog("bye -.-");
    process.exit(0);
  }

  async function menu() {
    console.log("\n");
    console.log("==========================================");
    console.log("Sweep v1.0                              ||");
    console.log("==========================================");
    console.log("-   config                              ||");
    console.log("-   state                               ||");
    console.log("----------------------------------------||");
    console.log("-   addMinter [minter] [amount]         ||");
    console.log("-   periodTime [days]                   ||");
    console.log("-   interest [rate]                     ||");
    console.log("-   pause                               ||");
    console.log("-   unpause                             ||");
    console.log("==========================================");

    const answer = (await ask("$> ")).split(" ");

    const options = {
      "config": config, "c": config,
      "state": state, "s": state, 

      "pause": pause.bind(),
      "unpause": unpause.bind(),

      "addMinter": addMinter.bind(this, answer[1], answer[2]), // addMinter [minter] [amount]
      "periodTime": setPeriodTime.bind(this, answer[1]), // setPeriodTime [days]
      "interest": setInterest.bind(this, answer[1], answer[2]), // setInterest [rate] 

      "exit": exit
    };

    try { await options[answer[0]].call() }
    catch (e) { redlog(e) }
    await menu();
  }

  await menu();

};

main();

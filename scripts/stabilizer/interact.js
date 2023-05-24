const { ethers } = require("hardhat");
const readline = require('readline');
const { addresses } = require('../../utils/address');

async function main() {
  let txn;
  var isOnChainAsset = false;
  [liquidator] = await ethers.getSigners();
  
  // Contracts
  const pool = addresses.uniswap_pool;

  const sweep = await ethers.getContractAt("SweepDollarCoin", addresses.sweep);
  const usd = await ethers.getContractAt("ERC20", addresses.usdc);
  const weth = await ethers.getContractAt("ERC20", addresses.weth);
  const balancer = await ethers.getContractAt("Balancer", addresses.balancer);
  
  let asset = await ethers.getContractAt("OffChainAsset", addresses.asset_offChain);
  let stabilizer = await ethers.getContractAt("Stabilizer", addresses.stabilizer_offChain);
  const stabilizer_uniswap = await ethers.getContractAt("Stabilizer", addresses.stabilizer_uniswap);

  const treasury = await sweep.treasury();
  const wallet = await asset.wallet();

  // Helper functions 
  function greenlog(msg) { console.log(`\x1b[32m${msg}\x1b[0m`) }
  function redlog(msg) { console.log(`\x1b[31m${msg}\x1b[0m`) }
  function pp(v, d) { return ethers.utils.formatUnits(v.toString(), d) }

  async function increaseTime(day) {
    const time = day * 24 * 60 * 60;
    await network.provider.send("evm_increaseTime", [time]);
    await network.provider.send("evm_mine");
    greenlog("ok");
  }

  async function impersonate(account) {
    await hre.network.provider.request({method: "hardhat_impersonateAccount", params: [account]});
    user = await ethers.getSigner(account);
  }

  function ask(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    return new Promise(resolve => rl.question(query, ans => {
      rl.close();
      resolve(ans);
    }))
  }

  // Prints
  async function config() {
    const minter = await sweep.minters(stabilizer.address);
    console.log("\nConfig ---------------------------------------------------------------");
    console.log("              admin:", await sweep.owner());
    console.log("           borrower:", await stabilizer.borrower());
    console.log("   settings enabled:", await stabilizer.settings_enabled());
    console.log("              asset:", await stabilizer.asset());
    console.log("------------------------------------------------------------------------");
    console.log("             sweep:", await stabilizer.sweep());
    console.log("               usd:", await stabilizer.usdx());
    console.log("------------------------------------------------------------------------");
    console.log("        MAX_BORROW:", pp(minter[0], 18));
    console.log("------------------------------------------------------------------------");
    console.log("Sweep has Minter whitelisted:", minter[2]);
    console.log("------------------------------------------------------------------------");
    // console.log("Transfer Approver Whitelist:");
    // console.log("        Stabilizer:", await approver.isWhitelisted(stabilizer.address));
    // console.log("             Asset:", await approver.isWhitelisted(asset.address));
    // console.log("          Borrower:", await approver.isWhitelisted(borrower.address));
    // console.log("            Wallet:", await approver.isWhitelisted(wallet));
    // console.log("               AMM:", await approver.isWhitelisted(amm.address));
    // console.log("          Treasury:", await approver.isWhitelisted(treasury));
    // console.log("------------------------------------------------------------------------");
    greenlog("ok");
  }

  async function state() {
    console.log("\nEXTERNAL ACCOUNTS");
    console.log("------------------------------------------");
    console.log("               Borrower:", pp(await usd.balanceOf(addresses.borrower), 6), "usd");
    console.log("               Borrower:", pp(await sweep.balanceOf(addresses.borrower), 18), "sweep");
    console.log("             Liquidator:", pp(await weth.balanceOf(liquidator.address), 18), "weth");
    console.log("             Liquidator:", pp(await sweep.balanceOf(liquidator.address), 18), "sweep");
    console.log("               Treasury:", pp(await sweep.balanceOf(treasury), 18), "sweep");
    console.log("\nSTABILIZER STATE");
    console.log("------------------------------------------");
    console.log("               frozen:", await stabilizer.frozen());
    console.log("            defaulted:", await stabilizer.isDefaulted());
    console.log(" minimum_equity_ratio:", pp(await stabilizer.min_equity_ratio(), 4), "%");
    console.log("           loan limit:", pp(await stabilizer.loan_limit(), 18), "sweep")
    console.log("       mint available:", (await _getMintAvailable()).toFixed(3), "sweep")
    console.log("       sweep borrowed:", pp(await stabilizer.sweep_borrowed(), 18), "sweep")
    console.log("        sweep balance:", pp(await sweep.balanceOf(stabilizer.address), 18), "sweep");
    console.log("         usdx balance:", pp(await usd.balanceOf(stabilizer.address), 6), "usd");
    console.log("  Current Asset Value:", pp(await asset.currentValue(), 6), "usd");
    console.log(" Junior Tranche Value:", pp(await stabilizer.getJuniorTrancheValue(), 6), "usd");
    console.log("         Equity Ratio:", pp(await stabilizer.getEquityRatio(), 4), "%");
    console.log("           Spread fee:", pp(await stabilizer.spread_fee(), 4), "%");
    console.log("         Spread value:", pp(await stabilizer.accruedFee(), 18), "sweep");
    console.log("         liquidatable:", await stabilizer.liquidatable());
    console.log("  liquidator discount:", pp(await stabilizer.liquidator_discount(), 4), "%");
    console.log("           call delay:", pp(await stabilizer.call_delay(), 0), 's');
    console.log("                link:", await stabilizer.link());

    console.log(`\n${isOnChainAsset ? "ON" : "OFF"} - CHAIN ASSET STATE`);
    console.log("                Asset:", await stabilizer.asset());
    console.log("  Asset Current Value:", pp(await asset.currentValue(), 6), "usd");

    if (!isOnChainAsset) {
      console.log("------------------------------------------");
      console.log("          Asset wallet:", pp(await usd.balanceOf(wallet), 6), "usd");
      console.log("          Asset wallet:", pp(await sweep.balanceOf(wallet), 18), "sweep");
      console.log("           Redeem mode:", await asset.redeem_mode());
      console.log("         Redeem Amount:", pp(await asset.redeem_amount(), 6), "usd");
    }

    console.log("\nUNISWAP POOL STATE");
    console.log("------------------------------------------");
    console.log("        sweep balance:", pp(await sweep.balanceOf(pool), 18), "sweep");
    console.log("         usdx balance:", pp(await usd.balanceOf(pool), 6), "usd");
    console.log("------------------------------------------");
    greenlog("ok");
  }

  // ------------------------------------------

  async function switchToOffChainAsset() {
    stabilizer = await ethers.getContractAt("Stabilizer", addresses.stabilizer_offChain);;
    asset = await ethers.getContractAt("OffChainAsset", addresses.asset_offChain);;
    isOnChainAsset = false;
    greenlog("ok");
  }

  async function switchToOnChainAsset() {
    stabilizer = await ethers.getContractAt("Stabilizer", addresses.stabilizer_weth);;
    asset = await ethers.getContractAt("WETHAsset", addresses.asset_weth);;
    isOnChainAsset = true;
    greenlog("ok");
  }

  // ------------------------------------------

  async function set_config(
    _asset, 
    _min_equity_ratio, 
    _spread_fee, 
    _loan_limit, 
    _liquidator_discount, 
    _call_delay, 
    _auto_invest_min_ratio, 
    _auto_invest_min_amount, 
    _auto_invest, 
    _link
  ) {
    console.log("setting asset to:", _asset);
    console.log("setting min equity ratio to:", _min_equity_ratio, '%');
    console.log("setting spread fee to:", _spread_fee, '%');
    console.log("setting loan limit to:", _loan_limit);
    console.log("setting liquidator discount to:", _liquidator_discount, '%');
    console.log("setting call delay to:", _call_delay, 'days');
    console.log("setting auto invest min equity ratio to:", _auto_invest_min_ratio);
    console.log("setting auto invest min amount to:", _auto_invest_min_amount);
    console.log("setting auto investable:", _auto_invest);
    console.log("setting link to:", _link);

    _min_equity_ratio = _min_equity_ratio * 1e4;
    _spread_fee = _spread_fee * 1e4;
    _loan_limit = ethers.utils.parseUnits(_loan_limit, 18);
    _liquidator_discount = _liquidator_discount * 1e4;
    _call_delay = _call_delay * 24 * 3600;
    _auto_invest_min_ratio = _auto_invest_min_ratio * 1e4;
    _auto_invest_min_amount = ethers.utils.parseUnits(_auto_invest_min_amount, 18);

    await impersonate(addresses.borrower);
    txn = await stabilizer.connect(user).configure(
      _asset, 
      _min_equity_ratio, 
      _spread_fee, 
      _loan_limit, 
      _liquidator_discount, 
      _call_delay, 
      _auto_invest_min_ratio, 
      _auto_invest_min_amount, 
      _auto_invest, 
      _link
    );
    await txn.wait();
    greenlog("ok");
  }

  async function set_tp(price) {
    console.log("setting target price to:", price, "usd ...");
    await impersonate(addresses.multisig);
    price = price * 1e6;
    txn = await sweep.connect(user).setTargetPrice(price, price);
    await txn.wait();
    greenlog("ok");
  }

  async function set_cav(cav) {
    console.log("setting cav to:", cav, "usd ...");
    await impersonate(addresses.multisig);
    txn = await asset.connect(user).updateValue(cav * 1e6);
    await txn.wait();
    greenlog("ok");
  }

  async function set_frozen(frozen) {
    frozen = frozen === "t";
    console.log("setting frozen to:", frozen);
    await impersonate(addresses.multisig);
    txn = await stabilizer.connect(user).setFrozen(frozen);
    await txn.wait();
    greenlog("ok");
  }

  async function set_borrower(addr) {
    console.log("setting borrower to:", addr);
    await impersonate(addresses.multisig);
    txn = await stabilizer.connect(user).setBorrower(addr);
    await txn.wait();
    greenlog("ok");
  }

  async function add_minter(addr, amount) {
    amount = ethers.utils.parseUnits(amount, 18);
    await impersonate(addresses.multisig);
    txn = await sweep.connect(user).addMinter(addr, amount);
    await txn.wait();
    greenlog("ok");
  }

  async function is_minter(addr) {
    await impersonate(addresses.multisig);
    let re = await sweep.isValidMinter(addr);
    greenlog(re);
  }

  // ------------------------------------------
  async function deposit(token, amount) {
    await impersonate(addresses.borrower);

    if (token == "d") {
      await depositUSDX(amount);
    } else {
      await depositSWEEP(amount);
    }
  }

  async function depositUSDX(amount) {
    console.log("depositing:", amount, "usd ...");
    txn = await usd.connect(user).transfer(stabilizer.address, amount * 1e6);
    await txn.wait();
    greenlog("ok");
  }

  async function depositSWEEP(amount) {
    console.log("depositing:", amount, "sweep ...");
    const sweepAmount = ethers.utils.parseUnits(amount, 18);
    txn = await sweep.connect(user).transfer(stabilizer.address, sweepAmount);
    await txn.wait();
    greenlog("ok");
  }

  async function borrow(amount) {
    console.log("borrowing sweep ...");
    const mint_available = await _getMintAvailable();
    if(mint_available < amount) {
      redlog(`The amount is more than the mintable amount. \nThe max available amount is ${mint_available}.`);
    } else {
      const sweepAmount = ethers.utils.parseUnits(amount, 18);
      await impersonate(addresses.borrower);
      txn = await stabilizer.connect(user).borrow(sweepAmount);
      await txn.wait();
      greenlog("ok");
    }
  }

  // amount0: usdx amount, amount1: sweep amount
  async function invest(amount0, amount1) {
    const usdxAmount = ethers.utils.parseUnits(amount0, 6);
    const sweepAmount = ethers.utils.parseUnits(amount1, 18);
    await impersonate(addresses.borrower);
    txn = await stabilizer.connect(user).invest(usdxAmount, sweepAmount);
    await txn.wait();
    greenlog("ok");
  }

  async function divest(amount) {
    console.log("repaying:", amount, "usd ...");
    await impersonate(addresses.borrower);
    txn = await stabilizer.connect(user).divest(amount * 1e6);
    await txn.wait();
    greenlog("ok");
  }

  async function repay(amount) {
    console.log("repaying sweep amount ...");
    await impersonate(addresses.borrower);
    const sweepAmount = ethers.utils.parseUnits(amount, 18);
    txn = await stabilizer.connect(user).repay(sweepAmount);
    await txn.wait();
    greenlog("ok");
  }

  async function withdraw(token, amount) {
    await impersonate(addresses.borrower);
    if (token == "d") {
      await withdrawUSDX(amount);
    } else {
      await withdrawSWEEP(amount);
    }
  }

  async function withdrawUSDX(amount) {
    console.log("withdrawing:", amount, "usd ...");
    txn = await stabilizer.connect(user).withdraw(usd.address, amount * 1e6);
    await txn.wait();
    greenlog("ok");
  }

  async function withdrawSWEEP(amount) {
    console.log("withdrawing:", amount, "sweep ...");
    const sweepAmount = ethers.utils.parseUnits(amount, 18);
    txn = await stabilizer.connect(user).withdraw(sweep.address, sweepAmount);
    await txn.wait();
    greenlog("ok");
  }

  async function payFee() {
    console.log("paying protocol spread ...");
    await impersonate(addresses.borrower);
    txn = await stabilizer.connect(user).payFee();
    await txn.wait();
    greenlog("ok");
  }

  async function collect() {
    console.log("collecting rewards ...");
    await impersonate(addresses.borrower);
    txn = await stabilizer.connect(user).collect();
    await txn.wait();
    greenlog("ok");
  }

  async function liquidate() {
    console.log("liquidating ...");
    txn = await stabilizer.connect(liquidator).liquidate();
    await txn.wait();
    greenlog("ok");
  }

  // ------------------------------------------
  async function sellSweepOnAMM(amount) {
    console.log("swap sweep for usd ...");
    await impersonate(addresses.borrower);
    const sweepAmount = ethers.utils.parseUnits(amount, 18);
    txn = await stabilizer.connect(user).sellSweepOnAMM(sweepAmount, 0);
    await txn.wait();
    greenlog("ok");
  } 

  async function buySweepOnAMM(amount) {
    console.log("swap usd for sweep ...");
    await impersonate(addresses.borrower);
    txn = await stabilizer.connect(user).buySweepOnAMM(amount * 1e6, 0);
    await txn.wait();
    greenlog("ok");
  }

  async function swapSweepToUsdc(amount) {
    console.log("swap sweep for usd ...");
    await impersonate(addresses.borrower);
    const sweepAmount = ethers.utils.parseUnits(amount, 18);
    txn = await stabilizer.connect(user).swapSweepToUsdc(sweepAmount);
    await txn.wait();
    greenlog("ok");
  }

  async function swapUsdcToSweep(amount) {
    console.log("swap usd for sweep ...");
    await impersonate(addresses.borrower);
    txn = await stabilizer.connect(user).swapUsdcToSweep(amount * 1e6);
    await txn.wait();
    greenlog("ok");
  }

  // ------------------------------------------
  async function redeem(amount) {
    console.log("Payback to stabilizer", amount, "usd ...");
    await impersonate(wallet);
    txn = await usd.connect(user).transfer(stabilizer.address, amount * 1e6);
    await txn.wait();
    greenlog("ok");
  }

  // ------------------------------------------
  async function refreshInterestRate() {
    await impersonate(addresses.multisig);
    txn = await balancer.connect(user).refreshInterestRate();
    await txn.wait();
    greenlog("ok");
  }

  async function marginCalls(amount) {
    await impersonate(addresses.multisig);
    targets = [];
    percentages = [];
    amount = amount * 1e6;
    
    txn = await balancer.connect(user).marginCalls(targets, percentages, amount);
    await txn.wait();
    greenlog("ok");
  }

  async function exit() {
    greenlog("bye -.-");
    process.exit(0);
  }

  // ------------------------------------------
  async function fund() {
    await _fundETH();
    const mintAmount = ethers.utils.parseUnits("10000000", 18);
    const sweepAmount = ethers.utils.parseUnits("1000", 18);
    const usdcAmount = ethers.utils.parseUnits("1000", 6);
    const approveAmount = ethers.utils.parseUnits("10000000", 6);
    
    console.log("sending funds to actors ...");
    await impersonate(addresses.multisig);
    txn = await sweep.connect(user).addMinter(liquidator.address, mintAmount)
    await txn.wait();
    txn = await sweep.connect(liquidator).minter_mint(liquidator.address, sweepAmount);
    await txn.wait();
    txn = await sweep.connect(liquidator).minter_mint(addresses.borrower, sweepAmount);
    await txn.wait();

    await impersonate(addresses.usdc);
    txn = await usd.connect(user).transfer(addresses.borrower, usdcAmount);
    await txn.wait();
    txn = await usd.connect(user).transfer(addresses.stabilizer_uniswap, usdcAmount*3);
    await txn.wait();

    console.log("approving funds to the stabilizer ...");
    await impersonate(addresses.borrower);
    txn = await usd.connect(user).approve(addresses.stabilizer_offChain, approveAmount);
    await txn.wait();
    txn = await usd.connect(user).approve(addresses.stabilizer_weth, approveAmount);
    await txn.wait();
    txn = await sweep.connect(user).approve(addresses.stabilizer_offChain, sweepAmount);
    await txn.wait();
    txn = await sweep.connect(user).approve(addresses.stabilizer_weth, sweepAmount);
    await txn.wait();
    greenlog("ok");
  }

  async function increaseLiquidity() {
    const sweepAmount = ethers.utils.parseUnits("3000", 18);
    const usdcAmount = ethers.utils.parseUnits("3000", 6);
    txn = await sweep.connect(liquidator).minter_mint(addresses.stabilizer_uniswap, sweepAmount);
    await txn.wait();

    await impersonate(addresses.usdc);
    txn = await usd.connect(user).transfer(addresses.stabilizer_uniswap, usdcAmount);
    await txn.wait();

    await impersonate(addresses.owner);
    txn = await stabilizer_uniswap.connect(user).invest(usdcAmount, sweepAmount);
    await txn.wait();
  }

  async function decreaseLiquidity() {
    await impersonate(addresses.owner);
    txn = await stabilizer_uniswap.connect(user).divest(ethers.constants.MaxInt256);
    await txn.wait();
  }

  async function _fundETH() {
    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [addresses.multisig, ethers.utils.parseEther('5').toHexString()]
    });

    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [addresses.usdc, ethers.utils.parseEther('5').toHexString()]
    });

    await hre.network.provider.request({
      method: "hardhat_setBalance",
      params: [addresses.borrower, ethers.utils.parseEther('5').toHexString()]
    });
  }

  async function _getMintAvailable() {
    const min_equity_ratio = Number(pp(await stabilizer.min_equity_ratio(), 4));
    const total_value = Number(pp(await stabilizer.getCurrentValue(), 6));
    const sweep_borrowed = await stabilizer.sweep_borrowed();
    const senior_tranche_in_usdx = Number(pp(await sweep.convertToUSD(sweep_borrowed), 6));

    if (total_value == 0 || total_value <= senior_tranche_in_usdx) return 0;

    const available_amount_in_usdx = (total_value - senior_tranche_in_usdx) * 100 / min_equity_ratio - total_value;

    if(available_amount_in_usdx <= 0) return 0;
    else return USDXinSWEEP(available_amount_in_usdx);
  }

  async function USDXinSWEEP(amount) {
    const target_price = Number(pp(await sweep.target_price(), 6));

    return amount / target_price;
  }

  // ======================================================================
  async function menu() {
    console.log("\n");
    console.log("==========================================");
    console.log("Stabilizer v0.0.1                       ||");
    console.log("==========================================");
    console.log("-   config                              ||");
    console.log("-   state                               ||");
    console.log("-   fund                                ||");
    console.log("-   increaseLiquidity                   ||");
    console.log("-   decreaseLiquidity                   ||");
    console.log("----------------------------------------||");
    console.log("-   offChain (switch)                   ||");
    console.log("-   onChain (switch)                    ||");
    console.log("----------------------------------------||");
    console.log("-   delay [days]                        ||");
    console.log("----------------------------------------||");
    console.log("-   set_config [a][r][s][l][d][c][l][l] ||");
    console.log("-   set_tp [price]                      ||");
    console.log("-   set_cav [usdx]                      ||");
    console.log("-   set_frozen [t/f]                    ||");
    console.log("-   set_borrower [address]              ||");
    console.log("-   add_minter [address, amount]        ||");
    console.log("-   is_minter [address]                 ||");
    console.log("----------------------------------------||");
    console.log("-   deposit [d/s] [amount]              ||");
    console.log("-   borrow [sweep_amount]               ||");
    console.log("-   invest [usdx_amount] [sweep_amount] ||");
    console.log("-   divest [usdx_amount]                ||");
    console.log("-   repay [sweep_amount]                ||");
    console.log("-   withdraw [d/s] [amount]             ||");
    console.log("-   payFee                              ||");
    console.log("-   collect                             ||");
    console.log("-   liquidate                           ||");
    console.log("----------------------------------------||");
    console.log("-   sellSweepOnAMM [sweep_amount]       ||");
    console.log("-   buySweepOnAMM [usdx_amount]         ||");
    console.log("-   swapSweepToUsdc [sweep_amount]      ||");
    console.log("-   swapUsdcToSweep [usdx_amount]       ||");
    console.log("----------------------------------------||");
    console.log("-   redeem [usdx_amount]                ||");
    console.log("==========================================");
    console.log("Balancer v0.0.1                         ||");
    console.log("==========================================");
    console.log("-   refreshInterestRate                 ||");
    console.log("-   marginCalls [usdx_amount]           ||");
    console.log("==========================================");

    const answer = (await ask("$> ")).split(" ");

    const options = {
      "fund": fund,
      "increaseLiquidity": increaseLiquidity,
      "decreaseLiquidity": decreaseLiquidity,

      "config": config, "c": config,
      "state": state.bind(this, answer[1]), "s": state.bind(this, answer[1]), // s [s/b] s: stabilizer, b: balancer

      "offChain": switchToOffChainAsset.bind(),
      "onChain": switchToOnChainAsset.bind(),

      "delay": increaseTime.bind(this, answer[1]),
      
      "set_config": set_config.bind(this, answer[1], answer[2], answer[3], answer[4], answer[5], answer[6], answer[7], answer[8]),
      "set_tp": set_tp.bind(this, answer[1]),
      "set_tp": set_tp.bind(this, answer[1]),
      "set_cav": set_cav.bind(this, answer[1]),
      "set_frozen": set_frozen.bind(this, answer[1]),
      "set_borrower": set_borrower.bind(this, answer[1]),
      
      "add_minter": add_minter.bind(this, answer[1], answer[2]),
      "is_minter": is_minter.bind(this, answer[1]),

      "deposit": deposit.bind(this, answer[1], answer[2]), // deposti [d/s] [amount]
      "borrow": borrow.bind(this, answer[1]),

      "invest": invest.bind(this, answer[1], answer[2]), // invest [amount0] [amount1]
      "divest": divest.bind(this, answer[1]),
      "repay": repay.bind(this, answer[1]),
      "withdraw": withdraw.bind(this, answer[1], answer[2]), // withdraw [d/s] [amount]
      "payFee": payFee,
      "collect": collect,
      "liquidate": liquidate.bind(this, answer[1]),

      "sellSweepOnAMM": sellSweepOnAMM.bind(this, answer[1]),
      "buySweepOnAMM": buySweepOnAMM.bind(this, answer[1]),
      "swapSweepToUsdc": swapSweepToUsdc.bind(this, answer[1]),
      "swapUsdcToSweep": swapUsdcToSweep.bind(this, answer[1]),

      "redeem": redeem.bind(this, answer[1]),

      "refreshInterestRate": refreshInterestRate,
      "marginCalls": marginCalls.bind(this, answer[1]),

      "exit": exit
    };

    try { await options[answer[0]].call() }
    catch (e) { redlog(e) }
    await menu();
  }

  await menu();

};

main();

const { ethers } = require("hardhat");
const readline = require('readline');
const { addresses } = require('../../utils/address');

async function main() {
  let txn;
  [liquidator] = await ethers.getSigners();
  
  // Contracts
  const pool = addresses.uniswap_pool;
  const sweep = await ethers.getContractAt("SweepCoin", addresses.sweep);
  const usd = await ethers.getContractAt("ERC20", addresses.usdc);
  const asset = await ethers.getContractAt("AaveV3Asset", addresses.aave_strategy);
  const balancer = await ethers.getContractAt("Balancer", addresses.balancer);
  const treasury = await sweep.treasury();
  const OWNER = await sweep.owner();

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
    const minter = await sweep.minters(asset.address);
    console.log("\nConfig ---------------------------------------------------------------");
    console.log("              admin:", await sweep.owner());
    console.log("           borrower:", await asset.borrower());
    console.log("   settings enabled:", await asset.settingsEnabled());
    console.log("------------------------------------------------------------------------");
    console.log("             sweep:", await asset.sweep());
    console.log("               usd:", await asset.usdx());
    console.log("------------------------------------------------------------------------");
    console.log("        MAX_BORROW:", pp(minter[0], 18));
    console.log("------------------------------------------------------------------------");
    console.log("Sweep has Minter whitelisted:", minter[2]);
    console.log("------------------------------------------------------------------------");
    // console.log("Transfer Approver Whitelist:");
    // console.log("        Stabilizer:", await approver.isWhitelisted(asset.address));
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
    console.log("             Liquidator:", pp(await sweep.balanceOf(liquidator.address), 18), "sweep");
    console.log("               Treasury:", pp(await sweep.balanceOf(treasury), 18), "sweep");
    console.log("\nSTABILIZER STATE");
    console.log("------------------------------------------");
    console.log("               frozen:", await asset.frozen());
    console.log("            defaulted:", await asset.isDefaulted());
    console.log(" minimum_equity_ratio:", pp(await asset.minEquityRatio(), 4), "%");
    console.log("           loan limit:", pp(await asset.loanLimit(), 18), "sweep")
    console.log("       mint available:", (await _getMintAvailable()).toFixed(3), "sweep")
    console.log("       sweep borrowed:", pp(await asset.sweepBorrowed(), 18), "sweep")
    console.log("        sweep balance:", pp(await sweep.balanceOf(asset.address), 18), "sweep");
    console.log("         usdx balance:", pp(await usd.balanceOf(asset.address), 6), "usd");
    console.log("  Current Asset Value:", pp(await asset.currentValue(), 6), "usd");
    console.log("       Total invested:", pp(await asset.assetValue(), 6), "usd");
    console.log(" Junior Tranche Value:", pp(await asset.getJuniorTrancheValue(), 6), "usd");
    console.log("         Equity Ratio:", pp(await asset.getEquityRatio(), 4), "%");
    console.log("           Spread fee:", pp(await asset.spreadFee(), 4), "%");
    console.log("         Spread value:", pp(await asset.accruedFee(), 18), "sweep");
    console.log("         liquidatable:", await asset.liquidatable());
    console.log("  liquidator discount:", pp(await asset.liquidatorDiscount(), 4), "%");
    console.log("           call delay:", pp(await asset.callDelay(), 0), 's');
    console.log("                link:", await asset.link());
    console.log("\nUNISWAP POOL STATE");
    console.log("------------------------------------------");
    console.log("        sweep balance:", pp(await sweep.balanceOf(pool), 18), "sweep");
    console.log("         usdx balance:", pp(await usd.balanceOf(pool), 6), "usd");
    console.log("------------------------------------------");
    greenlog("ok");
  }

  async function set_config(
    _minEquityRatio, 
    _spreadFee, 
    _loanLimit, 
    _liquidatorDiscount, 
    _callDelay, 
    _autoInvestMinRatio, 
    _autoInvestMinAmount, 
    _auto_invest, 
    _link
  ) {
    console.log("setting min equity ratio to:", _minEquityRatio, '%');
    console.log("setting spread fee to:", _spreadFee, '%');
    console.log("setting loan limit to:", _loanLimit);
    console.log("setting liquidator discount to:", _liquidatorDiscount, '%');
    console.log("setting call delay to:", _callDelay, 'days');
    console.log("setting auto invest min equity ratio to:", _autoInvestMinRatio);
    console.log("setting auto invest min amount to:", _autoInvestMinAmount);
    console.log("setting auto investable:", _auto_invest);
    console.log("setting link to:", _link);

    _minEquityRatio = _minEquityRatio * 1e4;
    _spreadFee = _spreadFee * 1e4;
    _loanLimit = ethers.utils.parseUnits(_loanLimit, 18);
    _liquidatorDiscount = _liquidatorDiscount * 1e4;
    _callDelay = _callDelay * 24 * 3600;
    _autoInvestMinRatio = _autoInvestMinRatio * 1e4;
    _autoInvestMinAmount = ethers.utils.parseUnits(_autoInvestMinAmount, 18);

    await impersonate(addresses.borrower);
    txn = await asset.connect(user).configure(
      _minEquityRatio, 
      _spreadFee, 
      _loanLimit, 
      _liquidatorDiscount, 
      _callDelay, 
      _autoInvestMinRatio, 
      _autoInvestMinAmount, 
      _auto_invest, 
      _link
    );
    await txn.wait();
    greenlog("ok");
  }

  async function set_tp(price) {
    console.log("setting target price to:", price, "usd ...");
    await impersonate(OWNER);
    price = price * 1e6;
    txn = await sweep.connect(user).setTargetPrice(price, price);
    await txn.wait();
    greenlog("ok");
  }

  async function set_frozen(frozen) {
    frozen = frozen === "t";
    console.log("setting frozen to:", frozen);
    await impersonate(OWNER);
    txn = await asset.connect(user).setFrozen(frozen);
    await txn.wait();
    greenlog("ok");
  }

  async function set_borrower(addr) {
    console.log("setting borrower to:", addr);
    await impersonate(OWNER);
    txn = await asset.connect(user).setBorrower(addr);
    await txn.wait();
    greenlog("ok");
  }

  async function add_minter(addr, amount) {
    amount = ethers.utils.parseUnits(amount, 18);
    await impersonate(OWNER);
    txn = await sweep.connect(user).addMinter(addr, amount);
    await txn.wait();
    greenlog("ok");
  }

  async function is_minter(addr) {
    await impersonate(OWNER);
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
    txn = await usd.connect(user).transfer(asset.address, amount * 1e6);
    await txn.wait();
    greenlog("ok");
  }

  async function depositSWEEP(amount) {
    console.log("depositing:", amount, "sweep ...");
    const sweepAmount = ethers.utils.parseUnits(amount, 18);
    txn = await sweep.connect(user).transfer(asset.address, sweepAmount);
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
      txn = await asset.connect(user).borrow(sweepAmount);
      await txn.wait();
      greenlog("ok");
    }
  }

  async function invest(amount) {
    const usdxAmount = ethers.utils.parseUnits(amount, 6);
    await impersonate(addresses.borrower);
    txn = await asset.connect(user).invest(usdxAmount);
    await txn.wait();
    greenlog("ok");
  }

  async function divest(amount) {
    console.log("repaying:", amount, "usd ...");
    await impersonate(addresses.borrower);
    txn = await asset.connect(user).divest(amount * 1e6);
    await txn.wait();
    greenlog("ok");
  }

  async function repay(amount) {
    console.log("repaying sweep amount ...");
    await impersonate(addresses.borrower);
    const sweepAmount = ethers.utils.parseUnits(amount, 18);
    txn = await asset.connect(user).repay(sweepAmount);
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
    txn = await asset.connect(user).withdraw(usd.address, amount * 1e6);
    await txn.wait();
    greenlog("ok");
  }

  async function withdrawSWEEP(amount) {
    console.log("withdrawing:", amount, "sweep ...");
    const sweepAmount = ethers.utils.parseUnits(amount, 18);
    txn = await asset.connect(user).withdraw(sweep.address, sweepAmount);
    await txn.wait();
    greenlog("ok");
  }

  async function payFee() {
    console.log("paying protocol spread ...");
    await impersonate(addresses.borrower);
    txn = await asset.connect(user).payFee();
    await txn.wait();
    greenlog("ok");
  }

  async function liquidate() {
    console.log("liquidating ...");
    txn = await asset.connect(liquidator).liquidate();
    await txn.wait();
    greenlog("ok");
  }

  // ------------------------------------------
  async function sellSweepOnAMM(amount) {
    console.log("swap sweep for usd ...");
    await impersonate(addresses.borrower);
    const sweepAmount = ethers.utils.parseUnits(amount, 18);
    txn = await asset.connect(user).sellSweepOnAMM(sweepAmount, 0);
    await txn.wait();
    greenlog("ok");
  } 

  async function buySweepOnAMM(amount) {
    console.log("swap usd for sweep ...");
    await impersonate(addresses.borrower);
    txn = await asset.connect(user).buySweepOnAMM(amount * 1e6, 0);
    await txn.wait();
    greenlog("ok");
  }

  async function swapSweepToUsdc(amount) {
    console.log("swap sweep for usd ...");
    await impersonate(addresses.borrower);
    const sweepAmount = ethers.utils.parseUnits(amount, 18);
    txn = await asset.connect(user).swapSweepToUsdc(sweepAmount);
    await txn.wait();
    greenlog("ok");
  }

  async function swapUsdcToSweep(amount) {
    console.log("swap usd for sweep ...");
    await impersonate(addresses.borrower);
    txn = await asset.connect(user).swapUsdcToSweep(amount * 1e6);
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
    await impersonate(OWNER);
    txn = await sweep.connect(user).addMinter(liquidator.address, mintAmount)
    await txn.wait();
    txn = await sweep.connect(liquidator).minterMint(liquidator.address, sweepAmount);
    await txn.wait();
    txn = await sweep.connect(liquidator).minterMint(addresses.borrower, sweepAmount);
    await txn.wait();

    await impersonate(addresses.usdc);
    txn = await usd.connect(user).transfer(addresses.borrower, usdcAmount);
    await txn.wait();
    txn = await usd.connect(user).transfer(addresses.stabilizer_uniswap, usdcAmount*3);
    await txn.wait();

    console.log("approving funds to the stabilizer ...");
    await impersonate(addresses.borrower);
    txn = await usd.connect(user).approve(asset.address, approveAmount);
    await txn.wait();
    txn = await sweep.connect(user).approve(asset.address, sweepAmount);
    await txn.wait();
    await impersonate(liquidator.address);
    txn = await usd.connect(user).approve(asset.address, approveAmount);
    await txn.wait();
    txn = await sweep.connect(user).approve(asset.address, sweepAmount);
    await txn.wait();
    greenlog("ok");
  }

  async function increaseLiquidity() {
    const sweepAmount = ethers.utils.parseUnits("3000", 18);
    const usdcAmount = ethers.utils.parseUnits("3000", 6);
    txn = await sweep.connect(liquidator).minterMint(addresses.stabilizer_uniswap, sweepAmount);
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
      params: [OWNER, ethers.utils.parseEther('5').toHexString()]
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
    const minEquityRatio = Number(pp(await asset.minEquityRatio(), 4));
    const total_value = Number(pp(await asset.currentValue(), 6));
    const sweepBorrowed = await asset.sweepBorrowed();
    const senior_tranche_in_usdx = Number(pp(await sweep.convertToUSD(sweepBorrowed), 6));

    if (total_value == 0 || total_value <= senior_tranche_in_usdx) return 0;

    const available_amount_in_usdx = (total_value - senior_tranche_in_usdx) * 100 / minEquityRatio - total_value;

    if(available_amount_in_usdx <= 0) return 0;
    else return USDXinSWEEP(available_amount_in_usdx);
  }

  async function USDXinSWEEP(amount) {
    const targetPrice = Number(pp(await sweep.targetPrice(), 6));

    return amount / targetPrice;
  }

  async function marginCalls(amount) {
    await impersonate(OWNER);
    targets = [asset.address];
    percentages = [1000000];
    amount = amount * 1e6;
    
    txn = await balancer.connect(user).marginCalls(targets, percentages, amount);
    await txn.wait();
    greenlog("ok");
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
    console.log("-   marginCalls [usdx_amount]           ||");
    console.log("==========================================");

    const answer = (await ask("$> ")).split(" ");

    const options = {
      "fund": fund,
      "increaseLiquidity": increaseLiquidity,
      "decreaseLiquidity": decreaseLiquidity,

      "config": config, "c": config,
      "state": state.bind(this, answer[1]), "s": state.bind(this, answer[1]),

      "delay": increaseTime.bind(this, answer[1]),
      
      "set_config": set_config.bind(this, answer[1], answer[2], answer[3], answer[4], answer[5], answer[6], answer[7]),
      "set_tp": set_tp.bind(this, answer[1]),
      "set_frozen": set_frozen.bind(this, answer[1]),
      "set_borrower": set_borrower.bind(this, answer[1]),
      
      "add_minter": add_minter.bind(this, answer[1], answer[2]),
      "is_minter": is_minter.bind(this, answer[1]),

      "deposit": deposit.bind(this, answer[1], answer[2]), // deposti [d/s] [amount]
      "borrow": borrow.bind(this, answer[1]),

      "invest": invest.bind(this, answer[1]),
      "divest": divest.bind(this, answer[1]),
      "repay": repay.bind(this, answer[1]),
      "withdraw": withdraw.bind(this, answer[1], answer[2]), // withdraw [d/s] [amount]
      "payFee": payFee,
      "liquidate": liquidate.bind(this, answer[1]),

      "sellSweepOnAMM": sellSweepOnAMM.bind(this, answer[1]),
      "buySweepOnAMM": buySweepOnAMM.bind(this, answer[1]),
      "swapSweepToUsdc": swapSweepToUsdc.bind(this, answer[1]),
      "swapUsdcToSweep": swapUsdcToSweep.bind(this, answer[1]),

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

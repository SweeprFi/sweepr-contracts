const { artifacts } = require('hardhat');
const { addresses } = require("../utils/address");
const { sendEth } = require("../utils/helper_functions");

const SWEEP = artifacts.require("contracts/Sweep/Sweep.sol:SweepCoin");
const SWEEPR = artifacts.require("SweeprCoin");
const Governor = artifacts.require("SweeprGovernor");
const USDC = artifacts.require("ERC20");
// const UniswapOracle = artifacts.require("Oracle/UniswapOracle");

module.exports = async () => {
  // Get the necessary instances
  // ======================================================
  usdc_instance = await USDC.at(addresses.usdc);
  sweep_instance = await SWEEP.at(addresses.sweep);
  sweepr_instance = await SWEEPR.at(addresses.sweepr);
  governance_instance = await Governor.at(addresses.governance);
  // uniswap_oracle_instance = await UniswapOracle.at(addresses.uniswapOracle);
  // ----------------------------------------------
  USDC.setAsDeployed(usdc_instance);
  SWEEP.setAsDeployed(sweep_instance);
  SWEEPR.setAsDeployed(sweepr_instance);
  Governor.setAsDeployed(governance_instance);
  // UniswapOracle.setAsDeployed(uniswap_oracle_instance);
  // ----------------------------------------------
  sweep_owner = await sweep_instance.owner();
  await sendEth(sweep_owner);
  await sendEth(addresses.usdc);
  await sendEth(addresses.borrower);
  await sendEth(addresses.multisig);
}

const { artifacts } = require('hardhat');
const { addresses } = require("../utils/address");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { networks } = require("../hardhat.config");
const { sendEth } = require("../utils/helper_functions");

const SWEEP = artifacts.require("contracts/Sweep/Sweep.sol:SweepDollarCoin");
const SWEEPER = artifacts.require("SWEEPER");
const UniV3TWAPOracle = artifacts.require("Oracle/UniV3TWAPOracle");
const Governance = artifacts.require("SweepGovernor");
const USDC = artifacts.require("contracts/Common/ERC20/ERC20.sol:ERC20");

let blockNumber;

module.exports = async () => {
  if (!blockNumber) {
    url = networks.hardhat.forking.url;
    blockNumber = await ethers.provider.getBlockNumber();
  } else {
    await helpers.reset(url, blockNumber);
  }
  // Get the necessary instances
  // ======================================================
  usdc_instance = await USDC.at(addresses.usdc);
  sweep_instance = await SWEEP.at(addresses.sweep);
  sweeper_instance = await SWEEPER.at(addresses.sweeper);
  governance_instance = await Governance.at(addresses.governance);
  uniswap_oracle_instance = await UniV3TWAPOracle.at(addresses.uniV3Twap_oracle);
  // ----------------------------------------------
  USDC.setAsDeployed(usdc_instance);
  SWEEP.setAsDeployed(sweep_instance);
  SWEEPER.setAsDeployed(sweeper_instance);
  Governance.setAsDeployed(governance_instance);
  UniV3TWAPOracle.setAsDeployed(uniswap_oracle_instance);
  // ----------------------------------------------
  sweep_owner = await sweep_instance.owner();
  await sendEth(sweep_owner);
  await sendEth(addresses.usdc);
  await sendEth(addresses.borrower);
  await sendEth(addresses.multisig);
}

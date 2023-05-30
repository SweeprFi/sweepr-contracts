const {
  wallets,
  tokens,
  libraries,
  protocol,
  uniswap,
  networks,
  chainIDs,
  chainlink_oracle,
  assets,
} = require("./constants");
require('dotenv').config();

const chainId = process.env.CHAIN_ID;
const networkType = process.env.NETWORK_TYPE;

const addresses = {
  // Wallets
  owner: wallets.owner[chainId],
  borrower: wallets.borrower[chainId],
  wallet: wallets.wallet[chainId],
  agent: wallets.agent[chainId],
  treasury: wallets.treasury[chainId],
  usdc_holder: wallets.usdc_holder[chainId],
  comp_holder: wallets.comp_holder[chainId],
  multisig: wallets.multisig[chainId],

  // Tokens
  sweep: tokens.sweep[chainId],
  sweepr: tokens.sweepr[chainId],
  usdc: tokens.usdc[chainId],
  usdt: tokens.usdt[chainId],
  aave_usdc: tokens.aave_usdc[chainId],
  comp: tokens.comp[chainId],
  comp_cusdc: tokens.comp_cusdc[chainId],
  weth: tokens.weth[chainId],
  wbtc: tokens.wbtc[chainId],
  backed: tokens.backed[chainId],

  // Libraries
  liquidity_helper: libraries.liquidity_helper[chainId],
  uniswap_oracle: libraries.uniswap_oracle[chainId],
  aaveV3_pool: libraries.aaveV3_pool[chainId],
  comp_control: libraries.comp_control[chainId],
  glp_reward_router: libraries.glp_reward_router[chainId],
  backed_mint: libraries.backed_mint[chainId],
  backed_redeem: libraries.backed_redeem[chainId],

  // Oracles - ChainLink
  oracle_comp_usd: chainlink_oracle.comp_usd[chainId],
  oracle_weth_usd: chainlink_oracle.weth_usd[chainId],
  oracle_wbtc_usd: chainlink_oracle.wbtc_usd[chainId],
  oracle_usdc_usd: chainlink_oracle.usdc_usd[chainId],
  oracle_backed_usd: chainlink_oracle.backed_usd[chainId],

  // Sequencer Feed
  sequencer_feed: chainlink_oracle.sequencer_feed[chainId],

  // uniswap
  uniswap_factory: uniswap.factory[chainId],
  uniswap_router: uniswap.router[chainId],
  uniswap_universal_router: uniswap.universal_router[chainId],
  uniswap_position_manager: uniswap.positions_manager[chainId],
  uniswap_pool: uniswap.pool[chainId],
  uniswap_quoter: uniswap.quoter[chainId],
  
  // Periphery Contracts
  governance: protocol.governance[chainId],
  balancer: protocol.balancer[chainId],
  token_distributor: protocol.distributor[chainId],
  uniswap_amm: protocol.uniswap_amm[chainId],
  timelock: protocol.timelock[chainId],
  approver: protocol.approver[chainId],
  
  // Assets + Stabilizers
  asset_offChain: assets.off_chain[chainId],
  asset_aave: assets.aave[chainId],
  asset_uniswap: assets.uniswap[chainId],
  asset_weth: assets.weth[chainId],
  asset_wbtc: assets.wbtc[chainId],
  asset_compound: assets.compound[chainId],
}

const cardinality = uniswap.observationCardinality[chainId];

const network = {
  name: networks[chainId],
  type: networkType
}

const roles = {
  PROPOSER_ROLE: '0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1',
  EXECUTOR_ROLE: '0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63',
  CANCELLER_ROLE: '0xfd643c72710c63c0180259aba6b2d05451e3591a24e58b62239378085726f783'
}

function getDeployedAddress(networkName, contractType) {
  const chainID = chainIDs[networkName];

  if (chainID === undefined) {
      throw new Error("Invalid network name!")
  }

  let contractAddress;

  if (contractType == 'sweep') {
    contractAddress = tokens.sweep[chainID];
  } else if (contractType == 'sender') {
    contractAddress = protocol.omnichain_proposal_sender[chainID];
  } else if (contractType == 'executor') {
    contractAddress = protocol.omnichain_proposal_executor[chainID];
  } else {
    throw new Error("Invalid contract Type!");
  }

  return contractAddress;
}

module.exports = {
  chainId,
  addresses,
  network,
  roles,
  getDeployedAddress,
  cardinality
}
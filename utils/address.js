const {
  wallets,
  tokens,
  libraries,
  protocol,
  uniswap,
  networks,
  chainIDs,
  rpcLinks,
  apiKeys,
  chainlinkOracle,
  assets,
} = require("./constants");
require('dotenv').config();

const chainId = process.env.CHAIN_ID;
const networkType = process.env.NETWORK_TYPE;

const rpcLink = rpcLinks[chainId];
const apiKey = apiKeys[chainId];

const addresses = {
  // Wallets
  owner: wallets.owner[chainId],
  borrower: wallets.borrower[chainId],
  wallet: wallets.wallet[chainId],
  agent: wallets.agent[chainId],
  treasury: wallets.treasury[chainId],
  usdc_holder: wallets.usdc_holder[chainId],
  comp_holder: wallets.comp_holder[chainId],
  dai_holder: wallets.dai_holder[chainId],
  multisig: wallets.multisig[chainId],

  // Tokens
  sweep: tokens.sweep[chainId],
  sweepr: tokens.sweepr[chainId],
  usdc: tokens.usdc[chainId],
  usdc_e: tokens.usdc_e[chainId],
  usdt: tokens.usdt[chainId],
  aave_usdc: tokens.aave_usdc[chainId],
  comp_cusdc: tokens.comp_cusdc[chainId],
  weth: tokens.weth[chainId],
  wbtc: tokens.wbtc[chainId],
  backed: tokens.backed[chainId],
  dai: tokens.dai[chainId],
  gDai: tokens.gDai[chainId],
  usdPlus: tokens.usdPlus[chainId],
  ets: tokens.ets[chainId],

  // Libraries
  liquidity_helper: libraries.liquidity_helper[chainId],
  uniswap_oracle: libraries.uniswap_oracle[chainId],
  aaveV3_pool: libraries.aaveV3_pool[chainId],
  glp_reward_router: libraries.glp_reward_router[chainId],
  backed_mint: libraries.backed_mint[chainId],
  backed_redeem: libraries.backed_redeem[chainId],
  gDai_open_trades: libraries.gDai_open_trades[chainId],
  usdPlus_exchanger: libraries.usdPlus_exchanger[chainId],
  ets_exchanger: libraries.ets_exchanger[chainId],
  dsr_manager: libraries.dsr_manager[chainId],
  dss_psm: libraries.dss_psm[chainId],

  // Oracles - ChainLink
  oracle_weth_usd: chainlinkOracle.weth_usd[chainId],
  oracle_wbtc_usd: chainlinkOracle.wbtc_usd[chainId],
  oracle_usdc_usd: chainlinkOracle.usdc_usd[chainId],
  oracle_dai_usd: chainlinkOracle.dai_usd[chainId],
  oracle_backed_usd: chainlinkOracle.backed_usd[chainId],

  // Sequencer Feed
  sequencer_feed: chainlinkOracle.sequencer_feed[chainId],

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
  asset_backed: assets.backed[chainId],
  asset_marketmaker: assets.market_maker[chainId],
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
  } else if (contractType == 'sweepr') {
    contractAddress = tokens.sweepr[chainID];
  } else if (contractType == 'balancer') {
    contractAddress = protocol.balancer[chainID];
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
  cardinality,
  rpcLink,
  apiKey
}
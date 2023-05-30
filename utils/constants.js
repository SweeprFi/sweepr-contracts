const networks = {
  1: 'mainnet',
  5: 'goerli',
  421613: 'arbitrum_goerli',
  42161: 'arbitrum',
}

const chainIDs = {
  'mainnet': 1,
  'goerli': 5,
  'arbitrum_goerli': 421613,
  'arbitrum': 42161,
}

// Andy:0x87212Bc566b54C60CAca777565F0340F458B1C1b
// Sudb: 0x614Bdbe46B394ad2f1Db06E9236568C046007f67

const wallets = {
  owner: {
    1: '', // Ethereum Mainnet
    5: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A', // Ethereum Goerli
    421613: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A', // Arbitrum Goerli
    42161: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A', // Arbitrum One
  },
  borrower: {
    1: '',
    5: '0x93aE1efd2E78028351C080FA0fbBBeF97Ec42EAD',
    42161: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
  },
  wallet: {
    1: '',
    5: '0x93aE1efd2E78028351C080FA0fbBBeF97Ec42EAD',
    42161: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
  },
  agent: {
    1: '0x0000000000000000000000000000000000000000',
    5: '0x0000000000000000000000000000000000000000',
    42161: '0x0000000000000000000000000000000000000000',
  },
  treasury: {
    1: '',
    5: '0x44a0414409D83D34F0B2c65720bE79E769D00423',
    42161: '0x0d6fF486F1cdBb024942f62E5AD8c07091A53772',
  },
  usdc_holder: {
    1: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
    5: '0x93aE1efd2E78028351C080FA0fbBBeF97Ec42EAD',
    42161: '0xAEafDd0ce0c4ab0AC57913916E5c386D847609c3',
  },
  comp_holder: {
    1: '',
    5: '0xA051d2543AFC78b082832d6ef495e62Bb86490eb',
    42161: '',
  },
  multisig: { // Gnosis safe wallet
    1: '0x23Ab3E2954Ec5577730B7674f4bA9e78Eb96C4d1',
    5: '0x23Ab3E2954Ec5577730B7674f4bA9e78Eb96C4d1',
    42161: '0x23Ab3E2954Ec5577730B7674f4bA9e78Eb96C4d1',
  },
}

const tokens = {
  sweep: {
    1: '',
    5: '0xa17DDf49c930f14981aF83a38de9e6E89fa2F0C8',
    421613: '0xdAd3fECde16f4c3f5F55781a4Ee5701732919a89', // Arbitrum Goerli
    42161: '0x4F4219c9B851AEbB652DD182D944A99b0b68edcf',
  },
  sweepr: {
    1: '',
    5: '0x3535eF56511C676a1f12b8b1f208E7757Cd0f731',
    42161: '0x4d20a1d57435bA91614c215F843362e6E95555Bd',
  },
  usdc: {
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    5: '0x65aFADD39029741B3b8f0756952C74678c9cEC93', // Faucet: 0xA70D8aD6d26931d0188c642A66de3B6202cDc5FA
    42161: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  },
  usdt: {
    1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    5: '0x2E8D98fd126a32362F2Bd8aA427E59a1ec63F780', // Faucet: 0xA70D8aD6d26931d0188c642A66de3B6202cDc5FA
    42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
  aave_usdc: {
    1: '0xBcca60bB61934080951369a648Fb03DF4F96263C',
    5: '0x8Be59D90A7Dc679C5cE5a7963cD1082dAB499918', // aave eth USDC
    42161: '0x625E7708f30cA75bfd92586e17077590C60eb4cD',
  },
  comp: {
    1: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
    5: '0x3587b2F7E0E2D6166d6C14230e7Fe160252B0ba4',
    42161: '',
  },
  comp_cusdc: {
    1: '0x39AA39c021dfbaE8faC545936693aC917d5E7563',
    5: '0x73506770799Eb04befb5AaE4734e58C2C624F493',
    42161: '',
  },
  weth: {
    1: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    5: '0x60d4db9b534ef9260a88b0bed6c486fe13e604fc',
    42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  wbtc: {
    1: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    5: '',
    42161: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  },
}

const libraries = {
  liquidity_helper: {
    1: '',
    5: '0xD6eDDb13aD13767a2b4aD89eA94fcA0C6aB0f8D2',
    42161: '0x08D052d1CAc852905E4C0cAddF782e1af2b8B214',
  },
  uniswap_oracle: {
    1: '',
    5: '0xd652C68ED7e93Adc5616cC61142AeaA262B09326',
    42161: '0x8906DB8CAc58bb12c156eb1f57E5f8EBDCbB2257',
  },
  aaveV3_pool: {
    1: '',
    5: '0x7b5C526B7F8dfdff278b4a3e045083FBA4028790',
    42161: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  },
  comp_control: {
    1: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B',
    5: '0x05Df6C772A563FfB37fD3E04C1A279Fb30228621',
    42161: '',
  },
  glp_reward_router: {
    1: '',
    5: '',
    42161: '0xB95DB5B167D75e6d04227CfFFA61069348d271F5',
  }
}

const chainlink_oracle = {
  comp_usd: {
    1: '0xdbd020CAeF83eFd542f4De03e3cF0C28A4428bd5',
    5: '',
    42161: '0xe7C53FFd03Eb6ceF7d208bC4C13446c76d1E5884',
  },
  weth_usd: {
    1: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', // ETH - USD
    5: '0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e', // ETH - USD
    42161: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
  },
  wbtc_usd: {
    1: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c', // BTC - USD
    5: '0xA39434A63A52E749F02807ae27335515BA4b07F7', // BTC - USD
    42161: '0xd0C7101eACbB49F3deCcCc166d238410D6D46d57',
  },
  usdc_usd: {
    1: '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
    5: '0xAb5c49580294Aff77670F839ea425f5b78ab3Ae7',
    42161: '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3'
  },
  sequencer_feed: {
    1: '0x0000000000000000000000000000000000000000',
    5: '0x0000000000000000000000000000000000000000',
    421613: '0x4da69F028a5790fCCAfe81a75C0D24f46ceCDd69',
    42161: '0xfdb631f5ee196f0ed6faa767959853a9f217697d'
  }
}

const uniswap = {
  factory: {
    1: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    5: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    42161: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  router: {
    1: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    5: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    42161: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  universal_router: {
    1: '0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B',
    5: '0x4648a43B2C14Da09FdF82B161150d3F634f40491',
    42161: '0x4C60051384bd2d3C01bfc845Cf5F4b44bcbE9de5',
    421613: '0x4648a43B2C14Da09FdF82B161150d3F634f40491',
  },
  positions_manager: {
    1: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    5: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    42161: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  },
  pool: {
    1: '',
    5: '0xde5789B9690298C8D7418CC6eCE24f6EBce55aC2',
    42161: '0xF75F92BF819FcBA96209990aE040DABd9Fd1c067',
  },
  quoter: {
    1: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    5: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    42161: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
  },
}

const protocol = {
  governance: {
    1: '',
    5: '0x9C5A24302562cEfbdbeEAAbdE56CF9930Db3d615',
    42161: '0xD013237b30e5Bcd8924b85aCA7b2254DF06D5B92'
  },
  balancer: {
    1: '',
    5: '0x74Cc1bB5B94D4A9F4Fe8b83a9fFa76E04c50B4F5',
    42161: '0xd5268b0Eb94bC7507175046221f0f363e30596f0',
  },
  distributor: {
    1: '',
    5: '0x2C16b6d715af41C7AB01E7BFEBA497768982b906',
    42161: '',
  },
  uniswap_amm: {
    1: '',
    5: '0xd895F3549aBE7614db2C2B82a304aaA06253C66f',
    42161: '0x57F45f0F38A9eEC3Db698b19eabF613a9207a9c7',
  },
  omnichain_proposal_sender: {
    1: '',
    5: '0xEAD18f9DeE6a73C7c4251F31B91b063a0c54043A',
    421613: '',
    42161: ''
  },
  omnichain_proposal_executor: {
    1: '',
    5: '',
    421613: '0x004276c95961BE229393c4425E84259255564004',
    42161: ''
  },
  timelock: {
    1: '',
    5: '0x2E0D0086672A87fE9CC7Ad823466a5a52a82b23F',
    421613: '0xEda97F14dBCD80d20ec4a79D930c6896F92112F7',
    42161: '0xEda97F14dBCD80d20ec4a79D930c6896F92112F7',
  },
  approver: {
    1: '',
    5: '0xD0f13A43079fD22adbe772e59903c0e032E2FC72', // Whitelist
    // 5: '0xD02467129f35255b2710d9A1AF9dAA01730c3e29', // Blacklist
    // 42161: '0x9690b6F7Bb2Ea75F85a09E50eb00Cb8Ce60661dC', // Whitelist
    42161: '0x59490d4dcC479B3717A6Eb289Db929E125E86eB1' // blacklist
  },
}

const assets = {
  off_chain: {
    1: '',
    5: '0xC9F1dB9cb74E6f34C6983847c93D5CA3e40cFb48',
    42161: '0xecA8FCe753e10B87E40EDca2B6810Ae5Ea508FA4'
    // OLD: '0x7D009f68cc4323246cC563BF4Ec6db3d88A69384',
  },
  aave:{ // V3
    1: '',
    5: '0x6bE8ddC4543bCD842CB8602a158cCa1555CF62Bf',
    42161: '0x99fb540EA905Ac084F938c4aC7cDBAb88d650e25',
  },
  uniswap: {
    1: '',
    5: '0x26CC4A46484da4686c4D6E77767A6d7740F63f63',
    42161: '0x6Cd2f49d74dd5A0f16105B4563a5887aC14e096D',
    // OLD: '0x843aCEBB52B2B91DE9818DEE873103466379CaA1',
  },
  weth: {
    1: '',
    5: '',
    42161: '0xc625763a67735999FE52111c4CE4cd26C3C60186',
  },
  wbtc: {
    1: '',
    5: '',
    42161: '0xe45c18a04eB1027f8E2806b6291f23beAadC10a7',
  },
  compound:{
    1: '',
    5: '',
    42161: '',
  },
}

module.exports = {
  wallets,
  tokens,
  libraries,
  protocol,
  uniswap,
  networks,
  chainIDs,
  chainlink_oracle,
  assets,
}
module.exports = {

    network: {
        id: 137,
        name: 'polygon',
    },

    layerZero: {
        id: 109,
        endpoint: '0x3c2269811836af69497E5F486A85D7316753cf62',
    },

    alchemyLink: 'https://polygon-mainnet.g.alchemy.com/v2/' + process.env.ALCHEMY_KEY,
    scanApiKey: process.env.POLYGONSCAN_API_KEY,

    wallets: {
        multisig: '0x47671b43B6E05FC6f423595F625716A06d76D9Ec',
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
    },

    tokens: {
        sweep: '',
        sweepr: '',
        usdc: '',
        usdc_e: '',
    },

    assets: {
        usdPlus_exchanger: '',
        maple: {
            usdcPool: '',
            poolManager: '',
            withdrawalManager: '',
        }
    },

    chainlink: {
        usdc_usd: '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7',
        sequencer: '0x0000000000000000000000000000000000000000',
    },

    balancer: {
        factory: '0xe2fa4e1d17725e72dcdAfe943Ecf45dF4B9E285b',
    },

    deployments: {
        balancer: '',
        treasury: '',
        balancer_pool: '',
        balancer_amm: '',
        proposal_executor: '',

        assets: {
            uniswap: '',
            market_maker: '',
            usd_plus: '',
            maple: '',
        }
    },

};

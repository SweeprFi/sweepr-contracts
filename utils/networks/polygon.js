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

    uniswap: {
        factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        universal_router: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
        positions_manager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
        observationCardinality: 480,
        pool: ''
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
        liquidity_helper: '',

        assets: {
            uniswap: '',
            market_maker: '',
            usd_plus: '',
            maple: '',
        }
    },

};

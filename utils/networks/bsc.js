module.exports = {

    network: {
        id: 56,
        name: 'bsc',
    },

    layerZero: {
        id: 102,
        endpoint: '0x3c2269811836af69497E5F486A85D7316753cf62',
    },

    alchemyLink: 'https://bsc-dataseed.binance.org/',
    scanApiKey: process.env.BSCSCAN_API_KEY,

    wallets: {
        multisig: '0xEB0A2Dc76893c436306266fe6F98257Ed40D5DC2',
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
    },

    tokens: {
        sweep: '0xB88a5Ac00917a02d82c7cd6CEBd73E2852d43574',
        sweepr: '0x89B1e7068bF8E3232dD8f16c35cAc45bDA584f4E',
        usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
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
        usdc_usd: '0x51597f405303c4377e36123cbc172b13269ea163',
        sequencer: '0x0000000000000000000000000000000000000000',
    },

    pancake: {
        factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
        router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
        positions_manager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
        observationCardinality: 480,
    },

    deployments: {
        balancer: '0xa884970F06Dda7BedD86829E14BeCa2c8fEd5220',
        treasury: '0x7c9131d7E2bEdb29dA39503DD8Cf809739f047B3',
        proposal_executor: '0xE7b247DBbb1bFdC8E223e78F9585ACF93Df297f5',
        balancer_amm: '',
        liquidity_helper: '',

        assets: {
            uniswap: '',
            market_maker: '',
            usd_plus: '',
            maple: '',
        }
    },

};

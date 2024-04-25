module.exports = {

    network: {
        id: 56,
        name: 'bsc',
    },

    layerZero: {
        id: 102,
        endpoint: '0x3c2269811836af69497E5F486A85D7316753cf62',
    },

    alchemyLink: 'https://bsc-dataseed1.defibit.io/',
    scanApiKey: process.env.BSCSCAN_API_KEY,

    wallets: {
        multisig: '0xEB0A2Dc76893c436306266fe6F98257Ed40D5DC2',
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
        borrower: '0xF2D3Ba4Ad843Ac0842Baf487660FCb3B208c988c',
        usdt_holder: '0xD183F2BBF8b28d9fec8367cb06FE72B88778C86B',
    },

    tokens: {
        sweep: '0xB88a5Ac00917a02d82c7cd6CEBd73E2852d43574',
        sweepr: '0x89B1e7068bF8E3232dD8f16c35cAc45bDA584f4E',
        usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        usdt: '0x55d398326f99059fF775485246999027B3197955',
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
        usdt_usd: '0xB97Ad0E74fa7d920791E90258A6E2085088b4320',
        sequencer: '0x0000000000000000000000000000000000000000',
    },

    pancake: {
        factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
        router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
        positions_manager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
        observationCardinality: 480,
    },

    protocols: {
        apollo: {
            apollo: "0x1b6F2d3844C6ae7D56ceb3C3643b9060ba28FEb0",
            apx: "0x78f5d389f5cdccfc41594abab4b0ed02f31398b3",
            alp: "0x4E47057f45adF24ba41375a175dA0357cB3480E5",
        }
    },

    deployments: {
        balancer: '0xa884970F06Dda7BedD86829E14BeCa2c8fEd5220',
        treasury: '0x7c9131d7E2bEdb29dA39503DD8Cf809739f047B3',
        proposal_executor: '0xE7b247DBbb1bFdC8E223e78F9585ACF93Df297f5',

        liquidity_helper: '0xD50DC42d95407F271c1380AE2aCa3F327F4C1cca',
        pancake_amm: '0xb86d3eea67A8bcaF232Ee9643d5ae5C44525c57e',
        pancake_pool: '0x0A5b6346B01092126FdFf8757864352843252864',

        assets: {
            pancake_market_maker: '0xe3E123ED9fec48a6f40A8aC7bE9afEDDAD80F146',
            apollox: '0x8aCc32A107e121aAF22Aa91b3F713376A08A02AB',
            usd_plus: '',
            maple: '',
        }
    },

};

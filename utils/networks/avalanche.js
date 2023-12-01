module.exports = {

    network: {
        id: 43114,
        name: 'avalanche',
    },

    layerZero: {
        id: 106,
        endpoint: '0x3c2269811836af69497E5F486A85D7316753cf62',
    },

    alchemyLink: 'https://api.avax.network/ext/bc/C/rpc',
    scanApiKey: 'avalanche',

    wallets: {
        multisig: '0x04997790D83C9f8021c63f6f613458507B73056c',
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
    },

    tokens: {
        sweep: '0xB88a5Ac00917a02d82c7cd6CEBd73E2852d43574',
        sweepr: '0x89B1e7068bF8E3232dD8f16c35cAc45bDA584f4E',
        usdc: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    },

    protocols: { },

    chainlink: {
        usdc_usd: '0xf096872672f44d6eba71458d74fe67f9a77a23b9',
        sequencer: '0x0000000000000000000000000000000000000000',
    },

    balancer: {
        factory: '0xE42FFA682A26EF8F25891db4882932711D42e467',
    },

    deployments: {
        balancer: '0xa884970F06Dda7BedD86829E14BeCa2c8fEd5220',
        treasury: '0x7c9131d7E2bEdb29dA39503DD8Cf809739f047B3',
        balancer_pool: '0x121b0DfC48444C4d10caddeD9885D90E7453E878',
        balancer_amm: '0x9693AEea2B32452e0834C860E01C33295d2164a5',
        proposal_executor: '0xE7b247DBbb1bFdC8E223e78F9585ACF93Df297f5',

        assets: {
            market_maker: '0x26D68988843197B22AB03c92519b357eCd9c5b5f',
        }
    },

};
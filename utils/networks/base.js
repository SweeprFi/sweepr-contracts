module.exports = {

    network: {
        id: 8453,
        name: 'base',
    },

    layerZero: {
        id: 184,
        endpoint: '0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7',
    },

    alchemyLink: 'https://eth-mainnet.alchemyapi.io/v2/' + process.env.ALCHEMY_KEY,
    scanApiKey: process.env.ETHERSCAN_API_KEY,

    misc: {
        observationCardinality: 480,
    },

    wallets: {
        multisig: '0xA8ec2d0b62b85E55f410C0C94C7dc45919ba7c0A',
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
    },

    tokens: {
        sweep: '0xB88a5Ac00917a02d82c7cd6CEBd73E2852d43574',
        sweepr: '0x89B1e7068bF8E3232dD8f16c35cAc45bDA584f4E',
        usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        usdc_e: '0xeb466342c4d449bc9f53a865d5cb90586f405215',
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
        usdc_usd: '0x7e860098f58bbfc8648a4311b374b1d669a2bc6b',
        sequencer: '0xBCF85224fc0756B9Fa45aA7892530B47e10b6433',
    },

    uniswap: {
        factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
        universal_router: '0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC',
        positions_manager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
        quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    },

    deployments: {
        balancer: '0xa884970F06Dda7BedD86829E14BeCa2c8fEd5220',
        treasury: '0x7c9131d7E2bEdb29dA39503DD8Cf809739f047B3',
        liquidity_helper: '0xC5f0DE0D8f48E12CcDE9f1902dE15A975b59768d',
        pool: '0xd72b983f56014e9672137469bfbcc5925b9a70a9',
        amm: '0xa5Dd492674f8C68C89b403BDFd0e794db42f2b92',
        proposal_executor: '0xE7b247DBbb1bFdC8E223e78F9585ACF93Df297f5',

        assets: {
            uniswap: '',
            market_maker: '',
            usd_plus: '',
            maple: '',
        }
    },

};

module.exports = {

    network: {
        id: 0,
        name: '',
    },

    layerZero: {
        id: 0,
        endpoint: '',
    },

    alchemyLink: '' + process.env.ALCHEMY_KEY,
    scanApiKey: process.env.XXXXXXSCAN_API_KEY,

    misc: {
        observationCardinality: 480,
    },

    wallets: {
        multisig:   '',
        owner:      '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
    },
      
    tokens: {
        sweep:      '0xB88a5Ac00917a02d82c7cd6CEBd73E2852d43574',
        sweepr:     '0x89B1e7068bF8E3232dD8f16c35cAc45bDA584f4E',
        usdc:       '',
        usdc_e:     '',
    },

    assets: {
        usdPlus_exchanger:  '',
        maple: {
            usdcPool: '',
            poolManager: '',
            withdrawalManager: '',
        }
    },

    chainlink: {
        usdc_usd:   '',
        sequencer:  '',
    },

    uniswap: {
        factory:            '',
        universal_router:   '',
        positions_manager:  '',
        quoterV2:           '',
    },

    deployments: {
        balancer:           '',
        treasury:           '',
        liquidity_helper:   '',
        pool:               '',
        amm:                '',
        proposal_executor:  '',

        assets: {
            uniswap:        '',  
            market_maker:   '',
            usd_plus:       '',
            maple:          '',
        }
    },

};

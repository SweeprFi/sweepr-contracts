module.exports = {

    network: {
        id: 8453,
        name: 'base',
    },

    layerZero: {
        id: 184,
        endpoint: '0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7',
    },

    alchemyLink: 'https://base-mainnet.g.alchemy.com/v2/' + process.env.ALCHEMY_KEY,
    scanApiKey: process.env.BASESCAN_API_KEY,

    wallets: {
        multisig: '0xA8ec2d0b62b85E55f410C0C94C7dc45919ba7c0A',
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
        borrower: '0xF2D3Ba4Ad843Ac0842Baf487660FCb3B208c988c',
        usdc_holder: '0xaac391f166f33cdaefaa4afa6616a3bea66b694d',
    },

    tokens: {
        sweep: '0xB88a5Ac00917a02d82c7cd6CEBd73E2852d43574',
        sweepr: '0x89B1e7068bF8E3232dD8f16c35cAc45bDA584f4E',
        usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        usdc_e: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    },

    protocols: {
        balancer: {
            bpt_4pool: '0x0c659734f1eef9c63b7ebdf78a164cdd745586db',
        },
        overnight: {
            usd_plus: '0xB79DD08EA68A908A97220C76d19A6aA9cBDE4376',
            exchange: '0x7cb1B38591021309C64f451859d79312d8Ca2789',
        },
        maple: {
            usdcPool: '0xdd5bb9acf5e02089735a33344c6e3a8bb0d4075d',
            withdrawalManager: '0x5B8387aDa310352198EBFF14a297FAb44428C8CD',
        },
        aura: {
            rewardPoolDepositWapper: '0xa9952c914d86f896c53bf17125c4104cc058008e',
            baseRewardPool4626: '0xee374580bff150be6b955954ac3b9899d890cb57',
            balancerPool: '0x433f09ca08623e48bac7128b7105de678e37d988',
            weighted_pool_library: '',
        }
    },

    chainlink: {
        usdc_usd: '0x7e860098f58bbfc8648a4311b374b1d669a2bc6b',
        sequencer: '0xBCF85224fc0756B9Fa45aA7892530B47e10b6433',
    },

    uniswap: {
        factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
        router: '',
        universal_router: '0xeC8B0F7Ffe3ae75d7FfAb09429e3675bb63503e4',
        positions_manager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
        observationCardinality: 480,
    },

    baseswap: {
        factory: '0x38015D05f4fEC8AFe15D7cc0386a126574e8077B',
        router: '0x1B8eea9315bE495187D873DA7773a874545D9D48',
        universal_router: '',
        positions_manager: '0xDe151D5c92BfAA288Db4B67c21CD55d5826bCc93',
        observationCardinality: 480,
    },

    balancer: {
        factory: '0x8df317a729fcaA260306d7de28888932cb579b88',
    },

    deployments: {
        balancer: '0xa884970F06Dda7BedD86829E14BeCa2c8fEd5220',
        treasury: '0x7c9131d7E2bEdb29dA39503DD8Cf809739f047B3',
        proposal_executor: '0xE7b247DBbb1bFdC8E223e78F9585ACF93Df297f5',

        balancer_pool: '0x15D9D108437B17d1FA70392f9eD086306229ec91',
        balancer_amm: '0xff368E106EA8782FaB6B2D4AD69739a60C66400E',

        liquidity_helper: '0xCFcE64f865f84144F9e6FA7C574F580B3eB878e6',
        baseswap_pool: '0x2313f60D9E0f33d65A22006DD3f661c373AA2c66',
        baseswap_amm: '0x33A48e4aA79A66fc4f7061f5D9E274528C213029',

        assets: {
            balancer_market_maker: '0x47a393e60DfCF12CA3892dBC2C2E66BCE083BB26',
            maple: '0xe55D44783D8DB0684fe992e87d4703632f66cBB3',
            usd_plus: '0x7537035fE6fFb0ed72Ee65B5569a5c090729f0Fa',
            baseswap_market_maker: '0x82f23E915985de7Db7C9463E4d898ccf2ab2fCeF',
        }
    },

};

/*
    NEW BALANCER MARKET MAKER: 0x11C8eC8B0DFD355C9931cB47ADd0F635dAE062ad
*/

module.exports = {

    network: {
        id: 421613,
        name: 'arbitrum_goerli',
    },

    layerZero: {
        id: 10143,
        endpoint: '0x6aB5Ae6822647046626e83ee6dB8187151E1d5ab',
    },

    alchemyLink: 'https://arb-goerli.g.alchemy.com/v2/' + process.env.ALCHEMY_KEY,
    scanApiKey: process.env.ARBISCAN_API_KEY,

    misc: {
        observationCardinality: 480,
    },

    wallets: {
        multisig: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',

        //test
        borrower: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
    },

    tokens: {
        sweep: '0xa5120a12Ff848b2e96439557A9f7E4083f921314',
        sweepr: '0x98d06DBb715e16dB57021eCA85b44e7916EB0c17',
        usdc: '0x8FB1E3fC51F3b789dED7557E680551d93Ea9d892',
        usdc_e: '',
    },

    protocols: {
        usdPlus_exchanger: '',
        maple: {
            usdcPool: '',
            poolManager: '',
            withdrawalManager: '',
        }
    },

    chainlink: {
        usdc_usd: '0x1692Bdd32F31b831caAc1b0c9fAF68613682813b',
        sequencer: '0x4da69F028a5790fCCAfe81a75C0D24f46ceCDd69',
    },

    uniswap: {
        factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        universal_router: '0x4648a43B2C14Da09FdF82B161150d3F634f40491',
        positions_manager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    },

    deployments: {
        balancer: '0xd4e0D68789694a2221b77C6823e914619310Ae18',
        treasury: '0x7c9131d7E2bEdb29dA39503DD8Cf809739f047B3',
        liquidity_helper: '0x524ff4dc8A0a66fDaC7F71d9d2babcE1d297006E',
        pool: '',
        amm: '0x14C53b4C05EC802c71CbFd8039e056573E902AFb',
        proposal_executor: '0x628ec44b95d527C32FC39b0475be4330c7F30bf9',
        timelock: '0xEda97F14dBCD80d20ec4a79D930c6896F92112F7',

        assets: {
            off_chain: '0xecA8FCe753e10B87E40EDca2B6810Ae5Ea508FA4',
            aave: '0x99fb540EA905Ac084F938c4aC7cDBAb88d650e25',
            weth: '0xc625763a67735999FE52111c4CE4cd26C3C60186',
            wbtc: '0xe45c18a04eB1027f8E2806b6291f23beAadC10a7',
        }
    },

};

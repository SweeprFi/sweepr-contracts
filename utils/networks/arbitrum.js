module.exports = {

    network: {
        id: 42161,
        name: 'arbitrum',
    },

    layerZero: {
        id: 110,
        endpoint: '0x3c2269811836af69497E5F486A85D7316753cf62',
    },

    alchemyLink: 'https://arb-mainnet.g.alchemy.com/v2/' + process.env.ALCHEMY_KEY,
    scanApiKey: process.env.ARBISCAN_API_KEY,

    misc: {
        observationCardinality: 480,
    },

    wallets: {
        multisig: '0x23Ab3E2954Ec5577730B7674f4bA9e78Eb96C4d1',
        wallet: '0x0000000000000000000000000000000000000000',
        agent: '0x0000000000000000000000000000000000000000',

        // tests
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
        borrower: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
        usdc_holder: '0x70d95587d40a2caf56bd97485ab3eec10bee6336',
        dai_holder: '0xf0428617433652c9dc6d1093a42adfbf30d29f74',
    },

    tokens: {
        sweep: '0xB88a5Ac00917a02d82c7cd6CEBd73E2852d43574',
        sweepr: '0x89B1e7068bF8E3232dD8f16c35cAc45bDA584f4E',
        usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        usdc_e: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
        usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        aave_usdc: '0x625E7708f30cA75bfd92586e17077590C60eb4cD',
        comp_cusdc: '0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA',
        weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        wbtc: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
        dai: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        gDai: '0xd85E038593d7A098614721EaE955EC2022B9B91B',
        usdPlus: '0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65',
        ets: '0x813fFCC4Af3e810E6b447235cC88A02f00454453',
    },

    protocols: {
        aaveV3_pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        glp_reward_router: '0xB95DB5B167D75e6d04227CfFFA61069348d271F5',
        gDai_open_trades: '0x990BA9Edd8a9615A23E4c452E63A80e519A4a23D',
        usdPlus_exchanger: '0x73cb180bf0521828d8849bc8CF2B920918e23032',
        ets_exchanger: '0xc2c84ca763572c6aF596B703Df9232b4313AD4e3',
        balancer_4pool_bpt: '0x423A1323c871aBC9d89EB06855bF5347048Fc4A5',
    },

    chainlink: {
        weth_usd: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
        wbtc_usd: '0xd0C7101eACbB49F3deCcCc166d238410D6D46d57',
        usdc_usd: '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3',
        dai_usd: '0xc5c8e77b397e531b8ec06bfb0048328b30e9ecfb',
        sequencer: '0xfdb631f5ee196f0ed6faa767959853a9f217697d',
    },

    balancer: {
        factory: '0xA8920455934Da4D853faac1f94Fe7bEf72943eF1',
    },

    uniswap: {
        factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        universal_router: '0x4C60051384bd2d3C01bfc845Cf5F4b44bcbE9de5',
        positions_manager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
        oracle: '0x8906DB8CAc58bb12c156eb1f57E5f8EBDCbB2257',
    },

    deployments: {
        governance: '0xC0507cFC6A9E65894C05C1c5b193C7B58b36791f',
        balancer: '0x82f23E915985de7Db7C9463E4d898ccf2ab2fCeF',
        treasury: '0x7c9131d7E2bEdb29dA39503DD8Cf809739f047B3',
        liquidity_helper: '0x7560d15774499386B04A64177E090B33e803493F',
        distributor: '0x90453f4969420c2DCE4344431303EAE679dB8F0b',
        uniswap_pool: '0xa7F4BC4689ed386F2cCa716207A1EbBb1172aaCB',
        balancer_pool: '0xef093ccfdd4d5a590b028463e0528049939889c9',
        // pool: '0xE3bf979ecE07baEf3682e8E2Faa23FB41683d7Af', // SWEEP / USDC.e (bridged)
        uniswap_amm: '0x6B8DcAD70Ff24FbB8Bc5807EF06A7930cD6702c8',
        balancer_amm: '0x0fba85de62c85c3cb444ec828b42bbf0a9208318',
        // amm: '0x709d075147a10495e5c3bBF3dfc0c138F34C6E72', // SWEEP / USDC.e (bridge)
        timelock: '0xE7b247DBbb1bFdC8E223e78F9585ACF93Df297f5',
        approver: '0x06d94665f02322781303224120326167483F5BD2', // whitelist from DeFi Ready
        vesting_approver: '0x483761F16A7c978df09d1e7E22532e9DbD2Ee8D0',
        proposal_sender: '0xC6c730E0424A01BF6e1A2ff4Ffac8540E29Dd185',

        assets: {
            off_chain: '0xecA8FCe753e10B87E40EDca2B6810Ae5Ea508FA4',
            aave: '0x99fb540EA905Ac084F938c4aC7cDBAb88d650e25',
            uniswap: '0xe55D44783D8DB0684fe992e87d4703632f66cBB3',
            weth: '0xc625763a67735999FE52111c4CE4cd26C3C60186',
            wbtc: '0xe45c18a04eB1027f8E2806b6291f23beAadC10a7',
            market_maker: '0x78326Ce3be64977658726EEdAd9A35de460E310A',
            usd_plus: '0x52D0a9E74fC159F47cEE668801082a975c10bBba',
        }
    },

};

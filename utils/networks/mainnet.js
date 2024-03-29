module.exports = {

    network: {
        id: 1,
        name: 'mainnet',
    },

    layerZero: {
        id: 101,
        endpoint: '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675',
    },

    alchemyLink: 'https://eth-mainnet.alchemyapi.io/v2/' + process.env.ALCHEMY_KEY,
    scanApiKey: process.env.ETHERSCAN_API_KEY,

    wallets: {
        multisig: '0x3afd8feED6Bbd1D8254d92eAFA1F695Dce16387a',
        wallet: '0x0000000000000000000000000000000000000000',
        borrower: '0xF2D3Ba4Ad843Ac0842Baf487660FCb3B208c988c',
        agent: '0x0000000000000000000000000000000000000000',

        // tests
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
        usdc_holder: '0xDa9CE944a37d218c3302F6B82a094844C6ECEb17',
        backed_holder: '0x1A8c53147E7b61C015159723408762fc60A34D17',
    },

    tokens: {
        sweep: '0xB88a5Ac00917a02d82c7cd6CEBd73E2852d43574',
        sweepr: '0x89B1e7068bF8E3232dD8f16c35cAc45bDA584f4E',
        usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        aave_usdc: '0xBcca60bB61934080951369a648Fb03DF4F96263C',
        comp_cusdc: '0x39AA39c021dfbaE8faC545936693aC917d5E7563',
        weth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        wbtc: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        backed: '0xCA30c93B02514f86d5C86a6e375E3A330B435Fb5',
        dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        frax: '0x853d955acef822db058eb8505911ed77f175b99e',
        sfrax: '0x03CB4438d015B9646d666316b617a694410C216d',
        usde: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3',
        susde: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497',
    },

    protocols: {
        maker: {
            psm: '0x89B78CfA322F6C5dE0aBcEecab66Aee45393cC5A',
            sdai: '0x83F20F44975D03b1b09e64809B757c47f942BEeA',
        },
        maple: {
            usdcPool: '0xfe119e9C24ab79F1bDd5dd884B86Ceea2eE75D92',
            withdrawalManager: '0x1146691782c089bCF0B19aCb8620943a35eebD12',

            //tests - whitelist lender
            poolManager: '0x219654a61a0bc394055652986be403fa14405bb8',
        }
    },

    chainlink: {
        frax_usd: '0xb9e1e3a9feff48998e45fa90847ed4d467e8bcfd',
        weth_usd: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
        wbtc_usd: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
        usdc_usd: '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
        dai_usd: '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9',
        backed_usd: '0x32d1463eb53b73c095625719afa544d5426354cb',
        // backed_usd: '0x788D911ae7c95121A89A0f0306db65D87422E1de', // research
        sequencer: '0x0000000000000000000000000000000000000000',
    },

    uniswap: {
        factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        universal_router: '0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B',
        positions_manager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
        observationCardinality: 96,
        pool_sweep: '0xfCAF342A7CbE3ea38622337F8d0Df029dc68bFF5',
        pool_frax: '0xc63B0708E2F7e69CB8A1df0e1389A98C35A76D52'
    },

    balancer: {
        factory: '0xDB8d758BCb971e482B2C45f7F8a7740283A1bd3A',
    },

    curve: {
        factory: '0x6A8cbed756804B16E05E741eDaBd5cB544AE21bf',
        router: '0xF0d4c12A5768D806021F80a262B4d39d26C58b8D',
        pool_usde: '0x02950460E2b9529D0E00284A5fA2d7bDF3fA4d72',
    },

    deployments: {
        balancer: '0x47a393e60DfCF12CA3892dBC2C2E66BCE083BB26',
        treasury: '0x7c9131d7E2bEdb29dA39503DD8Cf809739f047B3',
        liquidity_helper: '0xA014cCE13ECB3d92BB6D253b74Bb6E7Ed2418276',
        balancer_pool: '0xa468570dB143321Bc034BbD74A6Cc2694d15B252',
        balancer_amm: '0x9cE2837d6d84bb521A5a3002a2132B9E9E9cc4C8', // '0x28d5a9a0B763F219093Eb01056678e8e702Bf58A', // 0xe3E123ED9fec48a6f40A8aC7bE9afEDDAD80F146
        proposal_executor: '0xCFcE64f865f84144F9e6FA7C574F580B3eB878e6',
        curve_pool: '0x128a8d3081c64a7673234d236b78bb7dbc056a2b',
        curve_gauge: '0x6700cCF3404ef67d1abB7763c65749F62A762545',
        uniswap_amm: '',
        uniswap_pool: '',

        assets: {
            uniswap: '0x676524646377A6e66Ca797edF7CCB1B5162a8cE0',
            market_maker: '0x0FbA85De62C85c3cB444ec828b42BbF0a9208318', // '0x8adEa764cabd2C61E51cEb6937Fd026fA39d8E64',
            dai_dsr: '0x7537035fE6fFb0ed72Ee65B5569a5c090729f0Fa',
            maple: '0x6B8DcAD70Ff24FbB8Bc5807EF06A7930cD6702c8',
            sfrax: '0x82f23E915985de7Db7C9463E4d898ccf2ab2fCeF',
            uniswap_market_maker: '',
            ethena: '0x3bB6861c0Be6673809D55b9D346b6774B634a9D7',
        }
    },

};

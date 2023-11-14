module.exports = {

    network: {
        id: 5,
        name: 'goerli',
    },

    layerZero: {
        id: 10121,
        endpoint: '0xbfD2135BFfbb0B5378b56643c2Df8a87552Bfa23',
    },

    alchemyLink: 'https://eth-goerli.alchemyapi.io/v2/' + process.env.ALCHEMY_KEY,
    scanApiKey: process.env.ETHERSCAN_API_KEY,

    misc: {
        observationCardinality: 24,
    },

    wallets: {
        multisig: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',

        // test
        borrower: '0x93aE1efd2E78028351C080FA0fbBBeF97Ec42EAD',
        usdc_holder: '0x93aE1efd2E78028351C080FA0fbBBeF97Ec42EAD',
        comp_holder: '0xA051d2543AFC78b082832d6ef495e62Bb86490eb',
    },

    tokens: {
        sweep: '0x6C68a114c406dA77c3Ce1Ad1Cf09B420E37087b8',
        sweepr: '0x8CAb65C701225a2c465B9ed98B94942d8a09b63B',
        usdc: '0x07865c6E87B9F70255377e024ace6630C1Eaa37F',
        usdt: '0x2E8D98fd126a32362F2Bd8aA427E59a1ec63F780',
        aave_usdc: '0x8Be59D90A7Dc679C5cE5a7963cD1082dAB499918',
        comp_cusdc: '0x73506770799Eb04befb5AaE4734e58C2C624F493',
        weth: '0x60d4db9b534ef9260a88b0bed6c486fe13e604fc',
        backed: '0xcd75bf08f798C7a17F24DB2172490d88ED11BDd3',
    },

    protocols: {
        aaveV3_pool: '0x7b5C526B7F8dfdff278b4a3e045083FBA4028790',
        backed_mint: '0xfb8e5651209ab5bdc16a95ac4585f017305030ac',
        backed_redeem: '0x0d96fd4087211cef3babb45fc641fd9e429636d7',
        maple: {
            usdc_pool: '0x50c375fb7dd7336d8928c98708f80b4efca549e4',
            pool_manager: '0xe813686a4c3a9fe7716e2863f37aab1a42ae8488',
            withdrawal_manager: '0x9ee714ebf5a3d4b45d0cdaa4bc6b7356682a153c',
        }
    },

    chainlink: {
        usdc_usd: '0xAb5c49580294Aff77670F839ea425f5b78ab3Ae7',
        weth_usd: '0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e',
        wbtc_usd: '0xA39434A63A52E749F02807ae27335515BA4b07F7',  
        dai_usd: '0x0d79df66BE487753B02D015Fb622DED7f0E9798d',
        backed_usd: '0x788D911ae7c95121A89A0f0306db65D87422E1de',
        sequencer: '0x0000000000000000000000000000000000000000',
    },

    uniswap: {
        factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        universal_router: '0x4648a43B2C14Da09FdF82B161150d3F634f40491',
        positions_manager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    },

    deployments: {
        governance: '0x9C5A24302562cEfbdbeEAAbdE56CF9930Db3d615',
        distributor: '0x03DC6B552bff18C39F2bC027844789b205eF5781',
        balancer: '0x20955880B9d3ecC0df0681DDCD59665455e5f8af',
        treasury: '0x44a0414409D83D34F0B2c65720bE79E769D00423',
        liquidity_helper: '0x2F040113BaC69C046962900713e01AB1248AEF9B',
        pool: '0xf704129f06E8f414e92d212B60e3E8528B5E2554',
        amm: '0x1f1Da159Db4dAB54bfDcD94783e3B5234C2e8e11',
        proposal_sender: '0x31CfECAbf5eEAF3Fd92674F271D7C6AEb5bFB5f0',
        timelock: '0x2E0D0086672A87fE9CC7Ad823466a5a52a82b23F',
        approver: '0xD02467129f35255b2710d9A1AF9dAA01730c3e29',
        vesting_approver: '0xa912ac69710e90bc9b97ac70E56b8453193E1e44',

        assets: {
            off_chain: '0xC9F1dB9cb74E6f34C6983847c93D5CA3e40cFb48',
            aave: '0x924CCB6C4890b88F241cE3825c6C731967156897',
            uniswap: '0x26CC4A46484da4686c4D6E77767A6d7740F63f63',
            backed: '0x834557f46E2F3833e4f926Df1c4858F26A18E318',
            market_maker: '0x1655D8EC4d34BAE3E93a0864166676B86B0287d3',
        }
    },

};

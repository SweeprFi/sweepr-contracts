module.exports = {

    network: {
        id: 10,
        name: 'optimism',
    },

    layerZero: {
        id: 111,
        endpoint: '0x3c2269811836af69497E5F486A85D7316753cf62',
    },

    alchemyLink: 'https://opt-mainnet.g.alchemy.com/v2/' + process.env.ALCHEMY_KEY,
    scanApiKey: process.env.OPTIMISTIC_API_KEY,

    wallets: {
        multisig: '0xE0585bDaee364deAd2683c5Aa1520B87F1d2FBAD',
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
        borrower: '0xF2D3Ba4Ad843Ac0842Baf487660FCb3B208c988c',
        usdc_holder: '0xa1549a810b88313585e140e13081e1b7c2fe74a1',
    },

    tokens: {
        sweep: '0xB88a5Ac00917a02d82c7cd6CEBd73E2852d43574',
        sweepr: '0x89B1e7068bF8E3232dD8f16c35cAc45bDA584f4E',
        usdc: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
        usdc_e: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
        dai: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        yvMAI: '0x6759574667896a453304897993d61f00fdc7214d',
    },

    protocols: {
        balancer: {
            bpt_4pool: '0x9da11ff60bfc5af527f58fd61679c3ac98d040d9',
        },
        overnight: {
            usd_plus: '0x73cb180bf0521828d8849bc8CF2B920918e23032',
            exchange: '0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65',
        },
        yearn: {
            vault: '0x65343F414FFD6c97b0f6add33d16F6845Ac22BAc',
            stake: '0xf8126EF025651E1B313a6893Fcf4034F4F4bD2aA'
        }
    },

    chainlink: {
        usdc_usd: '0x16a9fa2fda030272ce99b29cf780dfa30361e0f3',
        sequencer: '0x371EAD81c9102C9BF4874A9075FFFf170F2Ee389',
    },

    uniswap: {
        factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        universal_router: '0x4648a43B2C14Da09FdF82B161150d3F634f40491',
        positions_manager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
        observationCardinality: 480,
    },

    balancer: {
        factory: '0x043A2daD730d585C44FB79D2614F295D2d625412',
    },

    deployments: {
        balancer: '0xa884970F06Dda7BedD86829E14BeCa2c8fEd5220',
        treasury: '0x7c9131d7E2bEdb29dA39503DD8Cf809739f047B3',
        proposal_executor: '0xE7b247DBbb1bFdC8E223e78F9585ACF93Df297f5',
        liquidity_helper: '0xe3E123ED9fec48a6f40A8aC7bE9afEDDAD80F146',
        
        // ACA
        uniswap_pool: '0x0215a3012611f9D9fe1590fb16C58E4920D9276D',
        uniswap_amm: '0x16F1B45f175D0d8625Fc57Eab12904C620D8D557',


        balancer_pool: '0xc4EE406970047A70aED14621d97b3B460a7DEA0B',
        balancer_amm: '0x33A48e4aA79A66fc4f7061f5D9E274528C213029', // '0x6B8DcAD70Ff24FbB8Bc5807EF06A7930cD6702c8',

        assets: {
            balancer_market_maker: '0x82f23E915985de7Db7C9463E4d898ccf2ab2fCeF',
            uniswap_market_maker: '0xb86d3eea67A8bcaF232Ee9643d5ae5C44525c57e',
            usd_plus: '0xcfce64f865f84144f9e6fa7c574f580b3eb878e6',
        }
    },

};

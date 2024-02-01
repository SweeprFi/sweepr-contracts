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

    wallets: {
        multisig: '0x23Ab3E2954Ec5577730B7674f4bA9e78Eb96C4d1',
        wallet: '0x0000000000000000000000000000000000000000',
        borrower: '0xF2D3Ba4Ad843Ac0842Baf487660FCb3B208c988c',
        agent: '0x0000000000000000000000000000000000000000',

        // tests
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
        usdc_holder: '0x70d95587d40a2caf56bd97485ab3eec10bee6336',
        dai_holder: '0xf0428617433652c9dc6d1093a42adfbf30d29f74',
        weth_holder: '0x489ee077994b6658eafa855c308275ead8097c4a',
    },

    tokens: {
        sweep: '0xB88a5Ac00917a02d82c7cd6CEBd73E2852d43574',
        sweepr: '0x89B1e7068bF8E3232dD8f16c35cAc45bDA584f4E',
        usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        usdc_e: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
        usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        comp_cusdc: '0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA',
        weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        wbtc: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
        dai: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        gDai: '0xd85E038593d7A098614721EaE955EC2022B9B91B',
        ets: '0x813fFCC4Af3e810E6b447235cC88A02f00454453',
        arb: '0x912CE59144191C1204E64559FE8253a0e49E6548',
    },

    protocols: {
        aave: {
            pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            usdc: '0x625E7708f30cA75bfd92586e17077590C60eb4cD',
        },
        glp_reward_router: '0xB95DB5B167D75e6d04227CfFFA61069348d271F5',
        gDai_open_trades: '0x990BA9Edd8a9615A23E4c452E63A80e519A4a23D',
        ets_exchanger: '0xc2c84ca763572c6aF596B703Df9232b4313AD4e3',

        balancer: {
            bpt_4pool: '0x423A1323c871aBC9d89EB06855bF5347048Fc4A5',
            gauge_4pool: '0xa14453084318277b11d38fbe05d857a4f647442b',
        },

        overnight: {
            usd_plus: '0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65',
            usd_plus_exchange: '0x73cb180bf0521828d8849bc8CF2B920918e23032',
        },

        silo: {
            silo: '0xa8897b4552c075e884bdb8e7b704eb10db29bf0d',
            lens: '0xBDb843c7a7e48Dc543424474d7Aa63b61B5D9536',
            shares: '0x713fc13caab628f116bc34961f22a6b44ad27668',
            incentives: '0x4999873bF8741bfFFB0ec242AAaA7EF1FE74FCE8',
        }
    },

    chainlink: {
        weth_usd: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
        wbtc_usd: '0xd0C7101eACbB49F3deCcCc166d238410D6D46d57',
        usdc_usd: '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3',
        dai_usd: '0xc5c8e77b397e531b8ec06bfb0048328b30e9ecfb',
        sequencer: '0xfdb631f5ee196f0ed6faa767959853a9f217697d',
    },

    uniswap: {
        factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        universal_router: '0x4C60051384bd2d3C01bfc845Cf5F4b44bcbE9de5',
        positions_manager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
        observationCardinality: 480,
        pool_sweep: '0xa7F4BC4689ed386F2cCa716207A1EbBb1172aaCB',
        pool_weth: '0xC6962004f452bE9203591991D15f6b388e09E8D0',
        pool_wbtc: '0x0E4831319A50228B9e450861297aB92dee15B44F',
    },

    pancake: {
        factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
        router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
        positions_manager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
        observationCardinality: 480,
    },

    balancer: {
        factory: '0xA8920455934Da4D853faac1f94Fe7bEf72943eF1',
    },

    curve: {
        factory: '0x9AF14D26075f142eb3F292D5065EB3faa646167b',
        router: '0xF0d4c12A5768D806021F80a262B4d39d26C58b8D',
    },

    deployments: {
        governance: '0xC0507cFC6A9E65894C05C1c5b193C7B58b36791f',
        balancer: '0x82f23E915985de7Db7C9463E4d898ccf2ab2fCeF',
        treasury: '0x7c9131d7E2bEdb29dA39503DD8Cf809739f047B3',
        distributor: '0x90453f4969420c2DCE4344431303EAE679dB8F0b',
        balancer_pool: '0xef093ccfdd4d5a590b028463e0528049939889c9',
        balancer_gauge: '0x38E434d74eabaf27169aC1c934886F344e332ba8',
        balancer_amm: '0x72E5b0E088c895ab0d6A86d14943C63aD735B7Cc', // '0x3bB6861c0Be6673809D55b9D346b6774B634a9D7',
        timelock: '0xE7b247DBbb1bFdC8E223e78F9585ACF93Df297f5',
        approver: '0x06d94665f02322781303224120326167483F5BD2',
        vesting_approver: '0x483761F16A7c978df09d1e7E22532e9DbD2Ee8D0',
        proposal_sender: '0xC6c730E0424A01BF6e1A2ff4Ffac8540E29Dd185',
        liquidity_helper: '0x11601A39307f2600a3650CA890cbaD253cdE1E38',
        rates_oracle: '0x0a843cC59346EB6e925D6e42263e6148197c96F8',
        curve_pool: '0x9097065db449a59ce30bec522e1e077292c0d8fc',
        curve_amm: '0x06128C0948b36eEBB863C34398e6E3043C879A9f',
        uniswap_pool: '0xA59B4cfAa5EA1506178e82D53a768FcF69945D65', // '0xa7F4BC4689ed386F2cCa716207A1EbBb1172aaCB',
        uniswap_amm: '0x6Ba9bebb3cF606e2514857581c8641bE31B9A59b', // '0xdA65daC88104ae4011C731d7DB0b5a04A683d550',

        assets: {
            balancer_market_maker: '0x30F5623c58bc93dB78FCa53D968B871A129Dfa31', // '0xA014cCE13ECB3d92BB6D253b74Bb6E7Ed2418276',
            curve_market_maker: '0x97f159A0b17f2808fd5cbFf4Fa2B35cEA710373A', // '0x6Bed9737Ef82588E91F6fae874a9beb577A3f0BD',
            uniswap_market_maker: '0xE7d1391DAeBE68E8d48B40948bA914602134A786', // 0xBAd1ac2433ffA6EEeD9f27067eF4FdD148d911F1
            silo: '0x53b5fae6e17c7f9b35952779150446e99a4887d3',
            balancer4pool: '0x591EcCf1847BF12C7B5F999E33c162dB90cB17C8',
        }
    },

};

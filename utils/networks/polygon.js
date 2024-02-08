module.exports = {

    network: {
        id: 137,
        name: 'polygon',
    },

    layerZero: {
        id: 109,
        endpoint: '0x3c2269811836af69497E5F486A85D7316753cf62',
    },

    alchemyLink: 'https://polygon-mainnet.g.alchemy.com/v2/' + process.env.ALCHEMY_KEY,
    scanApiKey: process.env.POLYGONSCAN_API_KEY,

    wallets: {
        multisig: '0x47671b43B6E05FC6f423595F625716A06d76D9Ec',
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
        borrower: '0xF2D3Ba4Ad843Ac0842Baf487660FCb3B208c988c',
    },

    tokens: {
        sweep: '0xB88a5Ac00917a02d82c7cd6CEBd73E2852d43574',
        sweepr: '0x89B1e7068bF8E3232dD8f16c35cAc45bDA584f4E',
        usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        usdc_e: '',
    },

    protocols: {},

    chainlink: {
        usdc_usd: '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7',
        sequencer: '0x0000000000000000000000000000000000000000',
    },

    uniswap: {
        factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        universal_router: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
        positions_manager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    },

    balancer: {
        factory: '0xe2fa4e1d17725e72dcdAfe943Ecf45dF4B9E285b',
    },

    deployments: {
        balancer: '0xa884970F06Dda7BedD86829E14BeCa2c8fEd5220',
        treasury: '0x7c9131d7E2bEdb29dA39503DD8Cf809739f047B3',
        balancer_pool: '0x4CD8a3Df2536100EC552a37C813A9414123e1c03',
        balancer_amm: '0x71Dc6599cbA8d7087725f23c0681308A13A451bB',
        proposal_executor: '0xE7b247DBbb1bFdC8E223e78F9585ACF93Df297f5',
        liquidity_helper: '',
        curve_pool: '0xcfde19f1a09206bb024f5c4bf61c40670fdff449',
        curve_amm: '0xe55D44783D8DB0684fe992e87d4703632f66cBB3',

        assets: {
            balancer_market_maker: '0x7685fc882c91936BF94974916cC410028F73C957',
            curve_market_maker: '0x8843b5Dd4A0757eE4ab639b34BA972686f9aCCD6',
        }
    },

};

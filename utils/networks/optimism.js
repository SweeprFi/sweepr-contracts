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

    misc: {
        observationCardinality: 480,
    },

    wallets: {
        multisig: '0xE0585bDaee364deAd2683c5Aa1520B87F1d2FBAD',
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
    },

    tokens: {
        sweep: '0xB88a5Ac00917a02d82c7cd6CEBd73E2852d43574',
        sweepr: '0x89B1e7068bF8E3232dD8f16c35cAc45bDA584f4E',
        usdc: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
        usdc_e: '0x7f5c764cbc14f9669b88837ca1490cca17c31607',
        usdcPlus: '0x73cb180bf0521828d8849bc8CF2B920918e23032'
    },

    protocols: {
        usdPlus_exchanger: '0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65',
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
    },

    deployments: {
        balancer: '0xa884970F06Dda7BedD86829E14BeCa2c8fEd5220',
        treasury: '0x7c9131d7E2bEdb29dA39503DD8Cf809739f047B3',
        liquidity_helper: '0xaD490d3899A47482E31AF50DdCc5Db31C0eE9eB0',
        pool: '0x8A0F60a4544c712Becdf9d6c4A920F4b756186ec',
        amm: '0x7685fc882c91936BF94974916cC410028F73C957',
        proposal_executor: '0xE7b247DBbb1bFdC8E223e78F9585ACF93Df297f5',
        

        assets: {
            uniswap: '0xC5f0DE0D8f48E12CcDE9f1902dE15A975b59768d',
            market_maker: '0x676524646377A6e66Ca797edF7CCB1B5162a8cE0',
            usd_plus: '0x709d075147a10495e5c3bBF3dfc0c138F34C6E72',
        }
    },

};
module.exports = {

    network: {
        id: 100,
        name: 'gnosis',
    },

    layerZero: {
        id: 145,
        endpoint: '0x9740FF91F1985D8d2B71494aE1A2f723bb3Ed9E4',
    },

    alchemyLink: 'https://rpc.gnosischain.com',
    scanApiKey: process.env.GNOSISSCAN_API_KEY,

    wallets: {
        multisig: '0x837bb49403346a307C449Fe831cCA5C1992C57f5',
        owner: '0x7Adc86401f246B87177CEbBEC189dE075b75Af3A',
        borrower: '',
        holder: '0xba12222222228d8ba445958a75a0704d566bf2c8', // wxDAI
    },

    tokens: {
        sweep: '',
        sweepr: '',
        usdc: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
        wxdai: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',
        agwxdai: '0xd4e420bBf00b0F409188b338c5D87Df761d6C894',
    },

    protocols: {
        agave: {
            pool: '0x5E15d5E33d318dCEd84Bfe3F4EACe07909bE6d9c'
        }
    },

    chainlink: {
        xdai_usd: '0x678df3415fc31947dA4324eC63212874be5a82f8',
        sequencer: '0x0000000000000000000000000000000000000000',
    },

    balancer: {
        factory: '0x4bdCc2fb18AEb9e2d281b0278D946445070EAda7',
    },

    deployments: {
        balancer: '',
        treasury: '',
        proposal_executor: '',

        balancer_pool: '',
        balancer_amm: '',

        assets: {
            balancer_market_maker: '',
            agave: '',
        }
    },

};

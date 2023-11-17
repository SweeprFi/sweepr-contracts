require('dotenv').config();
const constants = require('./networks/' + process.env.NETWORK);

const roles = {
    PROPOSER_ROLE: '0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1',
    EXECUTOR_ROLE: '0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63',
    CANCELLER_ROLE: '0xfd643c72710c63c0180259aba6b2d05451e3591a24e58b62239378085726f783'
}

const Const = {
    ZERO: 0,
    TRUE: true,
    FALSE: false,
    RATIO: 1e5, // 10 %
    spreadFee: 3e4, // 3 %
    DECREASE_FACTOR: 8e4, // 0,8%
    MIN_LIQUIDATION: 5e5, // 50%
    URL: "htttp://test.com",
    DAY: 86400, // seconds
    DAYS_5: 432000, // 5 days
    FEE: 500,
    NEW_FEE: 3000,
    PRICE: 1e6,
    WBTC_PRICE: 28e11,
    WBTC_AMM: 28e9,
    WETH_PRICE: 19e10,
    WETH_AMM: 19e8,
    USDC_PRICE: 99993053,
    BASIS_DENOMINATOR: 1e6,
    SLIPPAGE: 2000,
    UNISWAP_SLIPPAGE: 9e4, // 91% min out
    PROPOSAL_ACTIVE: 1,
    PROPOSAL_CANCELED: 2,
    PROPOSAL_SUCCEEDED: 4,
    PROPOSAL_QUEUED: 5,
    PROPOSAL_EXECUTED: 7,
    ADDRESS_ZERO: '0x0000000000000000000000000000000000000000',
    WBTC_HOLDER: '0x489ee077994b6658eafa855c308275ead8097c4a',
    WETH_HOLDER: '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8',
    EXCHANGER_ADMIN: '0x5CB01385d3097b6a189d1ac8BA3364D900666445',
    BLOCK_NUMBER: 64774877, // before adds BlockGetter
}

module.exports = {
    ...constants,
    roles,
    Const,
}

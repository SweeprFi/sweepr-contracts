const { ethers } = require('hardhat');
const { roles } = require("./address");

const sendEth = async (account) => {
    await hre.network.provider.request({
        method: "hardhat_setBalance",
        params: [account, ethers.utils.parseEther('15').toHexString()]
    });
}

const impersonate = async (account) => {
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [account]
    });
    return await ethers.getSigner(account);
}

const increaseTime = async (seconds) => {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
}

const toBN = (numb, exp) => {
    return ethers.utils.parseUnits(numb, exp);
}

const Const = {
    ZERO: 0,
    TRUE: true,
    FALSE: false,
    RATIO: 10e4, // 10 %
    SPREAD_FEE: 3e4, // 3 %
    DISCOUNT: 2e4, // 2%
    URL: "htttp://test.com",
    DAY: 86400, // seconds
    DAYS_5: 432000, // 5 days
    FEE: 500,
    NEW_FEE: 3000,
    PRICE: 1e6,
    WBTC_PRICE: 28e9,
    WETH_PRICE: 19e8,
    PROPOSAL_ACTIVE: 1,
    PROPOSAL_CANCELED: 2,
    PROPOSAL_SUCCEEDED: 4,
    PROPOSAL_QUEUED: 5,
    PROPOSAL_EXECUTED: 7,
    PROPOSER_ROLE: roles.PROPOSER_ROLE,
    EXECUTOR_ROLE: roles.EXECUTOR_ROLE,
    CANCELLER_ROLE: roles.CANCELLER_ROLE,
    ADDRESS_ZERO: ethers.constants.AddressZero,
    WBTC_HOLDER: '0x489ee077994b6658eafa855c308275ead8097c4a',
    WETH_HOLDER: '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8',
}

module.exports = {
    sendEth,
    impersonate,
    increaseTime,
    toBN,
    Const
}


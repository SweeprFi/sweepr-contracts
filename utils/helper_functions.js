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

const getBlockTimestamp = async () => {
    blockNumber = await ethers.provider.getBlockNumber();
    block = await ethers.provider.getBlock(blockNumber);
    return block.timestamp;
}

const getPriceAndData = (sweep, token, sweepAmount, tokenAmount) => {
    data = {};

    if (token.toString().toLowerCase() < sweep.toString().toLowerCase()) {
        data.token0 = token;
        data.token1 = sweep;

        data.tickLower = 276120; // 0.98
        data.tickUpper = 276520; // 1.02

        data.token0Amount = tokenAmount;
        data.token1Amount = sweepAmount;

        data.sqrtPriceX96 = toBN("79228162514264337593543950336000000", 0); // price = 1.0 ~> SW: 18 / TK: 6
    } else {
        data.token0 = sweep;
        data.token1 = token;

        data.tickLower = -276520; // 0.98
        data.tickUpper = -276120; // 1.02

        data.token0Amount = sweepAmount;
        data.token1Amount = tokenAmount;

        data.sqrtPriceX96 = toBN("79228162514264334008320", 0); // price = 1.0 ~> SW: 18 / TK: 6
    }

    return data;
}

const Const = {
    ZERO: 0,
    TRUE: true,
    FALSE: false,
    RATIO: 10e4, // 10 %
    spreadFee: 3e4, // 3 %
    DISCOUNT: 2e4, // 2%
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
    SLIPPAGE: 2000,
    UNISWAP_SLIPPAGE: 9e4, // 91% min out
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
    toBN,
    Const,
    sendEth,
    impersonate,
    increaseTime,
    getPriceAndData,
    getBlockTimestamp,
}


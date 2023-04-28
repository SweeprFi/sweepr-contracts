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

module.exports = {
    sendEth,
    impersonate,
    increaseTime
}


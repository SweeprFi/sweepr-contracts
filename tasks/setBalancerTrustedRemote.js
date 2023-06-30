const CHAIN_ID = require("../utils/layerzero/chainIds.json");
const { getDeployedAddress } = require('../utils/address');

module.exports = async function (taskArgs, hre) {
    // get deployed local and remote sweep address
    const localAddress = getDeployedAddress(hre.network.name, 'balancer');
    const remoteAddress = getDeployedAddress(taskArgs.targetNetwork, 'balancer');

    // get local contract
    const localBalancerInstance = await ethers.getContractAt("Balancer", localAddress);

    // get remote chain id
    const remoteChainId = CHAIN_ID[taskArgs.targetNetwork]

    // concat remote and local address
    let remoteAndLocal = hre.ethers.utils.solidityPack(
        ['address','address'],
        [remoteAddress, localAddress]
    )

    // check if pathway is already set
    const isTrustedRemoteSet = await localBalancerInstance.isTrustedRemote(remoteChainId, remoteAndLocal);

    if (!isTrustedRemoteSet) {
        try {
            let tx = await (await localBalancerInstance.setTrustedRemote(remoteChainId, remoteAndLocal)).wait()
            console.log(`✅ [${hre.network.name}] setTrustedRemote(${remoteChainId}, ${remoteAndLocal})`)
            console.log(` tx: ${tx.transactionHash}`)
        } catch (e) {
            if (e.error.message.includes("The chainId + address is already trusted")) {
                console.log("*source already set*")
            } else {
                console.log(`❌ [${hre.network.name}] setTrustedRemote(${remoteChainId}, ${remoteAndLocal})`)
            }
        }
    } else {
        console.log("*source already set*")
    }
}

const CHAIN_ID = require("../utils/layerzero/chainIds.json");
const { getDeployedAddress } = require('../utils/address');

module.exports = async function (taskArgs, hre) {
    // get deployed local and remote sweep address
    const localAddress = getDeployedAddress(hre.network.name, 'sweepr');
    const remoteAddress = getDeployedAddress(taskArgs.targetNetwork, 'sweepr');

    // get local contract
    const localSweepInstance = await ethers.getContractAt("SweeprCoin", localAddress);

    // get remote chain id
    const remoteChainId = CHAIN_ID[taskArgs.targetNetwork]

    // concat remote and local address
    let remoteAndLocal = hre.ethers.utils.solidityPack(
        ['address','address'],
        [remoteAddress, localAddress]
    )

    // check if pathway is already set
    const isTrustedRemoteSet = await localSweepInstance.isTrustedRemote(remoteChainId, remoteAndLocal);

    if (!isTrustedRemoteSet) {
        try {
            let tx = await (await localSweepInstance.setTrustedRemote(remoteChainId, remoteAndLocal)).wait()
            console.log(`✅ [${hre.network.name}] setTrustedRemote(${remoteChainId}, ${remoteAndLocal})`)
            console.log(` tx: ${tx.transactionHash}`)

            // // set destination min gas
	        await localSweepInstance.setMinDstGas(remoteChainId, parseInt(await localSweepInstance.PT_SEND()), 200000);
            await localSweepInstance.setUseCustomAdapterParams(true);
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

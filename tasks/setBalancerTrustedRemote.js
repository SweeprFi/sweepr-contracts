module.exports = async function (taskArgs, hre) {
    const sourceNetwork = require('../utils/networks/' + hre.network.name);
    const sourceAddress = sourceNetwork.deployments.balancer;

    const targetNetwork = require('../utils/networks/' + taskArgs.targetNetwork);
    const targetAddress = targetNetwork.deployments.balancer;

    const sourceContract = await ethers.getContractAt("Balancer", sourceAddress);
    const targetChainId = targetNetwork.layerZero.id;

    let packedAddresses = hre.ethers.utils.solidityPack(
        ['address','address'],
        [targetAddress, sourceAddress]
    )

    const isTrustedRemoteSet = await sourceContract.isTrustedRemote(targetChainId, packedAddresses);

    if (!isTrustedRemoteSet) {
        console.log("targetAddress check:", targetAddress);
        console.log(sourceNetwork.network.name, "=> Balancer @", sourceAddress);
        console.log("setTrustedRemote", targetChainId, packedAddresses);
    } else {
        console.log("*source already set*")
    }
}

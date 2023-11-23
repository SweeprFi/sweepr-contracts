module.exports = async function (taskArgs, hre) {
    const sourceNetwork = require('../utils/networks/' + hre.network.name);
    const sourceAddress = sourceNetwork.tokens.sweepr;

    const targetNetwork = require('../utils/networks/' + taskArgs.targetNetwork);
    const targetAddress = targetNetwork.tokens.sweepr;

    const sourceContract = await ethers.getContractAt("SweeprCoin", sourceAddress);
    const targetChainId = targetNetwork.layerZero.id;

    let packedAddresses = hre.ethers.utils.solidityPack(
        ['address','address'],
        [targetAddress, sourceAddress]
    )

    const isTrustedRemoteSet = await sourceContract.isTrustedRemote(targetChainId, packedAddresses);

    if (!isTrustedRemoteSet) {
        console.log("targetAddress check:", targetAddress);
        console.log(sourceNetwork.network.name, "=> Sweepr @", sourceAddress);
        console.log("setTrustedRemote", targetChainId, packedAddresses);
    } else {
        console.log("*source already set*")
    }
}

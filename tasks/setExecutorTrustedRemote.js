
module.exports = async function (taskArgs, hre) {
    const sourceNetwork = require('../utils/networks/' + hre.network.name);
    const sourceAddress = sourceNetwork.deployments.proposalExecutor;

    const targetNetwork = require('../utils/networks/' + taskArgs.targetNetwork);
    const targetAddress = targetNetwork.deployments.proposalSender;

    const sourceInstance = await ethers.getContractAt("OmnichainGovernanceExecutor", sourceAddress);
    const targetChainId = targetNetwork.layerZero.id;

    console.log(sourceNetwork.network.name);
    console.log("OmnichainGovernanceExecutor::setTrustedRemoteAddress");
    console.log("TargetChainId:", targetChainId);
    console.log("TargetAddress:", targetAddress);;
    console.log("Executing...:");

    try {
        let tx = await (await sourceInstance.setTrustedRemoteAddress(targetChainId, targetAddress)).wait()
        console.log(`✅ [${sourceNetwork.network.name}] setTrustedRemoteAddress(${targetChainId}, ${targetAddress})`)
        console.log(` tx: ${tx.transactionHash}`)
    } catch (e) {
        console.log(`❌ [${sourceNetwork.network.name}] setTrustedRemoteAddress(${targetChainId}, ${targetAddress})`)
    }
}
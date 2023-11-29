module.exports = async function (taskArgs, hre) {
    const sourceNetwork = require('../utils/networks/' + hre.network.name);
    const sourceAddress = sourceNetwork.deployments.proposal_sender;

    const targetNetwork = require('../utils/networks/' + taskArgs.targetNetwork);
    const targetAddress = targetNetwork.deployments.proposal_executor;

    const targetChainId = targetNetwork.layerZero.id;

    const OPS = await ethers.getContractAt("OmnichainProposalSender", sourceAddress);

    let currentRemoteAddress = "";
    try {
        currentRemoteAddress = await OPS.getTrustedRemoteAddress(targetChainId);
    } catch (e) {}

    if(currentRemoteAddress.toUpperCase() !== targetAddress.toUpperCase()) {
        console.log(sourceNetwork.network.name, "=> OmnichainProposalSender @", sourceAddress);
        console.log("setTrustedRemoteAddress", targetChainId, targetAddress);
    } else {
        console.log("*source already set*");
    }
}


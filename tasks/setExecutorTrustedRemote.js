
module.exports = async function (taskArgs, hre) {
    const sourceNetwork = require('../utils/networks/' + hre.network.name);
    const sourceAddress = sourceNetwork.deployments.proposal_executor;

    const targetNetwork = require('../utils/networks/' + taskArgs.targetNetwork);
    const targetAddress = targetNetwork.deployments.proposal_sender;

    const targetChainId = targetNetwork.layerZero.id;

    console.log(sourceNetwork.network.name, "=> OmnichainGovernanceExecutor @", sourceAddress);
    console.log("setTrustedRemoteAddress", targetChainId, targetAddress);
}

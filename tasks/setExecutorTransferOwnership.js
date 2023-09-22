const { addresses, getDeployedAddress } = require('../utils/address');

module.exports = async function (taskArgs, hre) {
    // get deployed local address
    const localAddress = getDeployedAddress(hre.network.name, 'executor');

    // get local contract
    const localInstance = await ethers.getContractAt("OmnichainGovernanceExecutor", localAddress);

    try {
        let tx = await (await localInstance.transferOwnership(localAddress)).wait()
        console.log(`✅  Transfer ownership success!`);
        console.log(` tx: ${tx.transactionHash}`)
    } catch (e) {
        console.log(`❌ Transfer ownership failed!`);
    }
}

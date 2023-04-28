const { addresses, getDeployedAddress } = require('../utils/address');

module.exports = async function (taskArgs, hre) {
    // get deployed local address
    const localAddress = getDeployedAddress(hre.network.name, 'sender');

    // get local contract
    const localInstance = await ethers.getContractAt("OmnichainProposalSender", localAddress);

    try {
        let tx = await (await localInstance.transferOwnership(addresses.timelock)).wait()
        console.log(`✅  Transfer ownership success!`);
        console.log(` tx: ${tx.transactionHash}`)
    } catch (e) {
        console.log(`❌ Transfer ownership failed!`);
    }
}

const CHAIN_ID = require("../utils/layerzero/chainIds.json");
const { addresses } = require('../utils/address');
const { getDeployedAddress } = require('../utils/address');

module.exports = async function (taskArgs, hre) {
    let owner = addresses.owner;
    let toAddress = addresses.owner;
    let qty = ethers.utils.parseEther(taskArgs.qty)

    // get deployed local sweep instance
    const localAddress = getDeployedAddress(hre.network.name, "sweep");
    const localSweepInstance = await ethers.getContractAt("SweepDollarCoin", localAddress);

    // get remote chain id
    const remoteChainId = CHAIN_ID[taskArgs.targetNetwork];

    // quote fee with default adapterParams
    let adapterParams = ethers.utils.solidityPack(["uint16", "uint256"], [1, 200000])

    let nativeFee = (await localSweepInstance.estimateSendFee(remoteChainId, toAddress, qty, false, adapterParams)).nativeFee;

    if (hre.network.name == "mainnet" || hre.network.name == "goerli") {
        nativeFee = Math.round(nativeFee * 1.2);
    }
    
    console.log(`fees (wei): ${nativeFee} / (eth): ${ethers.utils.formatEther(nativeFee)}`)

    let tx = await (
        await localSweepInstance.sendFrom(
            owner,                 // 'from' address to send tokens
            remoteChainId,                 // remote LayerZero chainId
            ethers.utils.solidityPack(["address"], [toAddress]),                     // 'to' address to send tokens
            qty,                           // amount of tokens to send (in wei)
            owner,                 // refund address (if too much message fee is sent, it gets refunded)
            ethers.constants.AddressZero,  // address(0x0) if not paying in ZRO (LayerZero Token)
            adapterParams,                          // flexible bytes array to indicate messaging adapter services
            { value: nativeFee }
        )
    ).wait()
    console.log(`✅ Message Sent [${hre.network.name}] sendTokens() to OFT @ LZ chainId[${remoteChainId}] token:[${toAddress}]`)
    console.log(` tx: ${tx.transactionHash}`)
    console.log(`* check your address [${owner}] on the destination chain, in the ERC20 transaction tab !"`)
}

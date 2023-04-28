task(
    "setSweepTrustedRemote",
    "setSweepTrustedRemote(chainId) to enable inbound/outbound messages with your other contracts",
    require("./setSweepTrustedRemote")
)
.addParam("targetNetwork", "the target network to set as a trusted remote")

task(
    "setSenderTrustedRemote",
    "setSenderTrustedRemote(chainId) to enable inbound/outbound messages with your other contracts",
    require("./setSenderTrustedRemote")
)
.addParam("targetNetwork", "the target network to set as a trusted remote")

task(
    "setExecutorTrustedRemote",
    "setExecutorTrustedRemote(chainId) to enable inbound/outbound messages with your other contracts",
    require("./setExecutorTrustedRemote")
)

task(
    "setSenderTransferOwnership",
    "setSenderTransferOwnership() to transfer ownership of OmnichainProposalSender",
    require("./setSenderTransferOwnership")
)

task(
    "setExecutorTransferOwnership",
    "setExecutorTransferOwnership() to transfer ownership of OmnichainProposalExecutor",
    require("./setExecutorTransferOwnership")
)

task(
    "payloadAddMinter",
    "payloadAddMinter() to create payload for adding minter",
    require("./payloadAddMinter")
)
.addParam("targetNetwork", "the target network to set as a trusted remote")
.addParam("minterAddress", "minter address to add")
.addParam("amount", "limit amount minter can mint")


task("oftSend", "send tokens to another chain", require("./oftSend"))
    .addParam("qty", "qty of tokens to send")
    .addParam("targetNetwork", "the target network to let this instance receive messages from")
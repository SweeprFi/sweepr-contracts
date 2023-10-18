task(
    "setSweepTrustedRemote",
    "setSweepTrustedRemote(chainId) to enable inbound/outbound messages with your other contracts",
    require("./setSweepTrustedRemote")
)
.addParam("targetNetwork", "the target network to set as a trusted remote")

task(
    "setSweeprTrustedRemote",
    "setSweeprTrustedRemote(chainId) to enable inbound/outbound messages with your other contracts",
    require("./setSweeprTrustedRemote")
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
.addParam("targetNetwork", "the target network to set as a trusted remote")

task(
    "setBalancerTrustedRemote",
    "setBalancerTrustedRemote(chainId) to enable inbound/outbound messages with your other contracts",
    require("./setBalancerTrustedRemote")
)
.addParam("targetNetwork", "the target network to set as a trusted remote")

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

task(
    "payloadTransferOwnership",
    "payloadTransferOwnership() to create payload for transferring ownership",
    require("./payloadTransferOwnership")
)
.addParam("targetNetwork", "the target network")
.addParam("newOwnerAddress", "new owner address")

task(
    "payloadApprove",
    "payloadApprove() to approve tokens to a spender",
    require("./payloadApprove")
)
.addParam("targetNetwork", "the target network")
.addParam("spenderAddress", "spender of the tokens")
.addParam("amount", "amount to be approved")


task("sweep_oftSend", "send tokens to another chain", require("./sweep_oftSend"))
    .addParam("qty", "qty of tokens to send")
    .addParam("targetNetwork", "the target network to let this instance receive messages from")

task("sweepr_oftSend", "send tokens to another chain", require("./sweepr_oftSend"))
    .addParam("qty", "qty of tokens to send")
    .addParam("targetNetwork", "the target network to let this instance receive messages from")


task("decodePayload", "decodes a payload", require("./decodePayload"))
    .addParam("payload", "payload to decode")
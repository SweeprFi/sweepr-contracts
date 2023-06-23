const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { addresses } = require('../utils/address');
const { toBN, Const } = require("../utils/helper_functions");

const chainIdSrc = 1;
const chainIdDst = 2;
let dstPath, srcPath;

let deployer, lzEndpointSrcMock, lzEndpointDstMock, OFTSrc, OFTDst, LZEndpointMock;

contract("Sweep - OFT", async function () {
    before(async () => {
        [deployer, multisig, receiver, treasury, newAddress, newMinter] = await ethers.getSigners();
        TRANSFER_AMOUNT = toBN("100", 18);
        interestRate = 5e4; // 5%
        // ------------- Deployment of contracts -------------
        LZEndpointMock = await ethers.getContractFactory("LZEndpointMock");
        lzEndpointSrcMock = await LZEndpointMock.deploy(chainIdSrc);
        lzEndpointDstMock = await LZEndpointMock.deploy(chainIdDst);
        Sweep = await ethers.getContractFactory("SweepCoin");
        Sweepr = await ethers.getContractFactory("SweeprCoin");

        const srcProxy = await upgrades.deployProxy(Sweep, [
            lzEndpointSrcMock.address,
            addresses.owner,
            2500 // 0.25%
        ]);
        sweepSrc = await srcProxy.deployed(Sweep);
        OFTSrc = await Sweepr.deploy(Const.TRUE, lzEndpointSrcMock.address); // TRUE means governance chain

        const dstProxy = await upgrades.deployProxy(Sweep, [
            lzEndpointDstMock.address,
            addresses.owner,
            2500 // 0.25%
        ]);
        sweepDst = await dstProxy.deployed(Sweep);
        OFTDst = await Sweepr.deploy(Const.FALSE, lzEndpointDstMock.address); // FALSE means non-governance chain

        // Mint 100 SWEEPR for owner in source chain
        await OFTSrc.connect(deployer).mint(deployer.address, TRANSFER_AMOUNT);

        // Reverts mint in destination chain, because destination chain is not governance chain
        await expect(OFTDst.connect(deployer).mint(deployer.address, TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'NotGovernanceChain');
    });

    beforeEach(async () => {
        // internal bookkeeping for endpoints (not part of a real deploy, just for this test)
        lzEndpointSrcMock.setDestLzEndpoint(OFTDst.address, lzEndpointDstMock.address)
        lzEndpointDstMock.setDestLzEndpoint(OFTSrc.address, lzEndpointSrcMock.address)

        // set each contracts source address so it can send to each other
        dstPath = ethers.utils.solidityPack(["address", "address"], [OFTDst.address, OFTSrc.address])
        srcPath = ethers.utils.solidityPack(["address", "address"], [OFTSrc.address, OFTDst.address])
        await OFTSrc.setTrustedRemote(chainIdDst, dstPath) // for A, set B
        await OFTDst.setTrustedRemote(chainIdSrc, srcPath) // for B, set A

        //set destination min gas
        await OFTSrc.setMinDstGas(chainIdDst, parseInt(await OFTSrc.PT_SEND()), 220000)
        await OFTSrc.setUseCustomAdapterParams(Const.TRUE)
    })

    describe("setting up stored payload", async function () {
        // v1 adapterParams, encoded for version 1 style, and 200k gas quote
        const adapterParam = ethers.utils.solidityPack(["uint16", "uint256"], [1, 225000])
        const sendQty = toBN("10", 18) // amount to be sent across

        it("sendFrom() - sends the payload", async function () {
            // ensure they're both starting with correct amounts
            expect(await OFTSrc.balanceOf(deployer.address)).to.be.equal(TRANSFER_AMOUNT)
            expect(await OFTDst.balanceOf(deployer.address)).to.be.equal(Const.ZERO)

            // block receiving msgs on the dst lzEndpoint to simulate ua reverts which stores a payload
            await lzEndpointDstMock.blockNextMsg()

            // estimate nativeFees
            const nativeFee = (await OFTSrc.estimateSendFee(chainIdDst, deployer.address, sendQty, false, adapterParam)).nativeFee

            // stores a payload
            await expect(
                OFTSrc.sendFrom(
                    deployer.address,
                    chainIdDst,
                    ethers.utils.solidityPack(["address"], [deployer.address]),
                    sendQty,
                    deployer.address,
                    ethers.constants.AddressZero,
                    adapterParam,
                    { value: nativeFee }
                )
            ).to.emit(lzEndpointDstMock, "PayloadStored")

            // verify tokens burned on source chain and minted on destination chain
            expect(await OFTSrc.balanceOf(deployer.address)).to.be.equal(TRANSFER_AMOUNT.sub(sendQty))
            expect(await OFTDst.balanceOf(deployer.address)).to.be.equal(0)
        })

        it("hasStoredPayload() - stores the payload", async function () {
            expect(await lzEndpointDstMock.hasStoredPayload(chainIdSrc, srcPath)).to.equal(Const.TRUE)
        })

        it("getLengthOfQueue() - cant send another msg if payload is blocked", async function () {
            // queue is empty
            expect(await lzEndpointDstMock.getLengthOfQueue(chainIdSrc, srcPath)).to.equal(0)

            // estimate nativeFees
            const nativeFee = (await OFTSrc.estimateSendFee(chainIdDst, deployer.address, sendQty, false, adapterParam)).nativeFee

            // now that a msg has been stored, subsequent ones will not revert, but will get added to the queue
            await expect(
                OFTSrc.sendFrom(
                    deployer.address,
                    chainIdDst,
                    ethers.utils.solidityPack(["address"], [deployer.address]),
                    sendQty,
                    deployer.address,
                    ethers.constants.AddressZero,
                    adapterParam,
                    { value: nativeFee }
                )
            ).to.not.reverted

            // queue has increased
            expect(await lzEndpointDstMock.getLengthOfQueue(chainIdSrc, srcPath)).to.equal(1)
        })

        it("retryPayload() - delivers a stuck msg", async function () {
            // balance before transfer is 0
            expect(await OFTDst.balanceOf(deployer.address)).to.be.equal(Const.ZERO)

            const payload = ethers.utils.defaultAbiCoder.encode(["uint16", "bytes", "uint256"], [0, deployer.address, sendQty])
            await expect(lzEndpointDstMock.retryPayload(chainIdSrc, srcPath, payload)).to.emit(lzEndpointDstMock, "PayloadCleared")

            // balance after transfer is sendQty
            expect(await OFTDst.balanceOf(deployer.address)).to.be.equal(sendQty)
        })
    })
})

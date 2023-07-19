const { expect } = require("chai");
const { ethers } = require("hardhat");
const { toBN, Const } = require("../utils/helper_functions");

const chainIdSrc = 1;
const chainIdDst = 2;

contract("Sweepr - OFT", async function () {
    before(async () => {
        [deployer, receiver] = await ethers.getSigners();
        MINTER_AMOUNT = toBN("200", 18);
        TRANSFER_AMOUNT = toBN("100", 18);
        interestRate = 5e4; // 5%
        // ------------- Deployment of contracts -------------
        Sweepr = await ethers.getContractFactory("SweeprCoin");
        LZEndpointMock = await ethers.getContractFactory("LZEndpointMock");

        lzEndpointSrcMock = await LZEndpointMock.deploy(chainIdSrc);
        lzEndpointDstMock = await LZEndpointMock.deploy(chainIdDst);

        OFTSrc = await Sweepr.deploy(Const.TRUE, lzEndpointSrcMock.address); // TRUE means governance chain
        OFTDst = await Sweepr.deploy(Const.FALSE, lzEndpointDstMock.address); // FALSE means non-governance chain

        lzEndpointSrcMock.setDestLzEndpoint(OFTDst.address, lzEndpointDstMock.address);
        lzEndpointDstMock.setDestLzEndpoint(OFTSrc.address, lzEndpointSrcMock.address);

        // set each contracts source address so it can send to each other
        dstPath = ethers.utils.solidityPack(["address", "address"], [OFTDst.address, OFTSrc.address]);
        srcPath = ethers.utils.solidityPack(["address", "address"], [OFTSrc.address, OFTDst.address]);
        await OFTSrc.setTrustedRemote(chainIdDst, dstPath) // for A, set B
        await OFTDst.setTrustedRemote(chainIdSrc, srcPath) // for B, set A

        //set destination min gas
        await OFTSrc.setMinDstGas(chainIdDst, parseInt(await OFTSrc.PT_SEND()), 220000);
        await OFTSrc.setUseCustomAdapterParams(Const.TRUE);

        // v1 adapterParams, encoded for version 1 style, and 200k gas quote
        adapterParam = ethers.utils.solidityPack(["uint16", "uint256"], [1, 225000]);
        sendQty = toBN("10", 18) // amount to be sent across
    });

    describe("setting up stored payload", async function () {
        it("mint() - only on the governace chain", async function () {
            // Mint 200 SWEEPR for owner in source chain
            await OFTSrc.connect(deployer).mint(deployer.address, MINTER_AMOUNT);

            // Reverts mint in destination chain, because destination chain is not governance chain
            await expect(OFTDst.connect(deployer).mint(deployer.address, MINTER_AMOUNT))
                .to.be.revertedWithCustomError(Sweepr, 'NotGovernanceChain');
        });

        it("sendFrom() - sends the payload", async function () {
            // ensure they're both starting with correct amounts
            expect(await OFTSrc.balanceOf(deployer.address)).to.be.equal(MINTER_AMOUNT)
            expect(await OFTDst.balanceOf(deployer.address)).to.be.equal(Const.ZERO)

            // block receiving msgs on the dst lzEndpoint to simulate ua reverts which stores a payload
            await lzEndpointDstMock.blockNextMsg();

            // estimate nativeFees
            const nativeFee = (await OFTSrc.estimateSendFee(chainIdDst, receiver.address, sendQty, false, adapterParam)).nativeFee

            // stores a payload
            await expect(
                OFTSrc.sendFrom(
                    deployer.address,
                    chainIdDst,
                    ethers.utils.solidityPack(["address"], [receiver.address]),
                    sendQty,
                    receiver.address,
                    Const.ADDRESS_ZERO,
                    adapterParam,
                    { value: nativeFee }
                )
            ).to.emit(lzEndpointDstMock, "PayloadStored");

            // verify tokens burned on source chain and minted on destination chain
            expect(await OFTSrc.balanceOf(deployer.address)).to.be.equal(MINTER_AMOUNT.sub(sendQty));
            expect(await OFTDst.balanceOf(deployer.address)).to.be.equal(0);
        })

        it("hasStoredPayload() - stores the payload", async function () {
            expect(await lzEndpointDstMock.hasStoredPayload(chainIdSrc, srcPath)).to.equal(Const.TRUE)
        })

        it("getLengthOfQueue() - cant send another msg if payload is blocked", async function () {
            // queue is empty
            expect(await lzEndpointDstMock.getLengthOfQueue(chainIdSrc, srcPath)).to.equal(0);

            // estimate nativeFees
            const nativeFee = (await OFTSrc.estimateSendFee(chainIdDst, deployer.address, sendQty, false, adapterParam)).nativeFee

            // now that a msg has been stored, subsequent ones will not revert, but will get added to the queue
            await expect(
                OFTSrc.sendFrom(
                    deployer.address,
                    chainIdDst,
                    ethers.utils.solidityPack(["address"], [receiver.address]),
                    sendQty,
                    receiver.address,
                    Const.ADDRESS_ZERO,
                    adapterParam,
                    { value: nativeFee }
                )
            ).to.not.reverted

            // queue has increased
            expect(await lzEndpointDstMock.getLengthOfQueue(chainIdSrc, srcPath)).to.equal(1);
        })

        it("retryPayload() - delivers a stuck msg", async function () {
            // balance before transfer is 0
            expect(await OFTDst.balanceOf(deployer.address)).to.be.equal(Const.ZERO);

            payload = ethers.utils.defaultAbiCoder.encode(
                ["uint16", "bytes", "uint256"],
                [0, receiver.address, sendQty]
            );
            await expect(lzEndpointDstMock.retryPayload(chainIdSrc, srcPath, payload))
                .to.emit(lzEndpointDstMock, "PayloadCleared");

            // balance after transfer is sendQty
            expect(await OFTDst.balanceOf(receiver.address)).to.be.equal(sendQty)
        });

        it("burn() - only on the governace chain", async function () {
            sended = sendQty.mul(2);
            burnQty = toBN("5", 18) // amount to be burned
            balanceBefore = await OFTSrc.balanceOf(deployer.address);

            expect(MINTER_AMOUNT.sub(sended)).to.be.equal(balanceBefore);

            await expect(OFTDst.connect(receiver).burn(burnQty))
                .to.be.revertedWithCustomError(OFTDst, "NotGovernanceChain");

            await expect(OFTDst.burnFrom(receiver.address, burnQty))
                .to.be.revertedWithCustomError(OFTDst, "NotGovernanceChain");

            await OFTSrc.burn(burnQty);

            balanceAfter = await OFTSrc.balanceOf(deployer.address);

            expect(balanceBefore.sub(burnQty)).to.be.equal(balanceAfter);
        });

        it("checks the minted amount", async function () {
            srcDeployerBalance = await OFTSrc.balanceOf(deployer.address);
            srcReceiverBalance = await OFTSrc.balanceOf(receiver.address);

            dstDeployerBalance = await OFTDst.balanceOf(deployer.address);
            dstReceiverBalance = await OFTDst.balanceOf(receiver.address);

            totalSrc = srcDeployerBalance.add(srcReceiverBalance);
            totalDst = dstDeployerBalance.add(dstReceiverBalance);

            expect(await OFTSrc.totalSupply()).to.be.equal(totalSrc);
            expect(await OFTSrc.circulatingSupply()).to.be.equal(totalSrc);

            expect(await OFTDst.totalSupply()).to.be.equal(totalDst);
            expect(await OFTDst.circulatingSupply()).to.be.equal(totalDst);

            expect(await OFTSrc.totalMinted()).to.be.equals(MINTER_AMOUNT.sub(burnQty));
            expect(await OFTDst.totalMinted()).to.be.equals(Const.ZERO);
        });

        it("add destination chain", async function () {
            expect(await OFTSrc.chainCount()).to.be.equal(Const.ZERO)

            await OFTSrc.addChain(chainIdDst, sweepDst.address);
            expect(await OFTSrc.chainCount()).to.be.equal(1);

            chain = await OFTSrc.chains(chainIdDst);
            expect(chain).to.equal(sweepDst.address);

            sweepAddress = await OFTSrc.getBalancerWithChainId(chainIdDst);
            expect(sweepAddress).to.equal(sweepDst.address);
        })

        it("remove destination chain", async function () {
            expect(await OFTSrc.chainCount()).to.be.equal(1)

            await OFTSrc.removeChain(0);
            expect(await OFTSrc.chainCount()).to.be.equal(Const.ZERO);

            chain = await OFTSrc.chains(chainIdDst);
            expect(chain).to.equal(Const.ADDRESS_ZERO);
        })
    });
});

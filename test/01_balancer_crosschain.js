const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { addresses } = require('../utils/address');
const { toBN, Const, getBlockTimestamp, sendEth } = require("../utils/helper_functions");

const chainIdSrc = 1;
const chainIdDst = 2;
let dstPath, srcPath;

let deployer, lzEndpointSrcMock, lzEndpointDstMock, OFTSrc, OFTDst, LZEndpointMock;

contract("Balancer - Crosschain message", async function () {
    before(async () => {
        [deployer, multisig, receiver, treasury, newAddress, newMinter] = await ethers.getSigners();
        TRANSFER_AMOUNT = toBN("100", 18);
        interestRate = 5e4; // 5%
        // ------------- Deployment of contracts -------------
        LZEndpointMock = await ethers.getContractFactory("LZEndpointMock");
        lzEndpointSrcMock = await LZEndpointMock.deploy(chainIdSrc);
        lzEndpointDstMock = await LZEndpointMock.deploy(chainIdDst);
        Sweep = await ethers.getContractFactory("SweepMock");
        Balancer = await ethers.getContractFactory("Balancer");
        Sweepr = await ethers.getContractFactory("SweeprCoin");

        const srcProxy = await upgrades.deployProxy(Sweep, [
            lzEndpointSrcMock.address,
            deployer.address,
            2500 // 0.25%
        ]);

        sweepSrc = await srcProxy.deployed(Sweep);
		balancerSrc = await Balancer.deploy(sweepSrc.address, lzEndpointSrcMock.address);

        sweeprSrc = await Sweepr.deploy(Const.TRUE, lzEndpointSrcMock.address); // TRUE means governance chain
        await sweepSrc.setBalancer(balancerSrc.address);
        await balancerSrc.setSweepr(sweeprSrc.address);

        const dstProxy = await upgrades.deployProxy(Sweep, [
            lzEndpointDstMock.address,
            deployer.address,
            2500 // 0.25%
        ]);

        sweepDst = await dstProxy.deployed(Sweep);
        balancerDst = await Balancer.deploy(sweepDst.address, lzEndpointDstMock.address);

        await sweepDst.setBalancer(balancerDst.address);
        await sweeprSrc.addChain(chainIdDst, sweepDst.address);
    });

    beforeEach(async () => {
        // internal bookkeeping for endpoints (not part of a real deploy, just for this test)
        lzEndpointSrcMock.setDestLzEndpoint(balancerDst.address, lzEndpointDstMock.address)
        lzEndpointDstMock.setDestLzEndpoint(balancerSrc.address, lzEndpointSrcMock.address)

        // set each contracts source address so it can send to each other
        dstPath = ethers.utils.solidityPack(["address", "address"], [balancerDst.address, balancerSrc.address])
        srcPath = ethers.utils.solidityPack(["address", "address"], [balancerSrc.address, balancerDst.address])

        await balancerSrc.setTrustedRemote(chainIdDst, dstPath) // for A, set B
        await balancerDst.setTrustedRemote(chainIdSrc, srcPath) // for B, set A

        await sendEth(balancerSrc.address);
    })

    it("set interest rate", async function () {
        await balancerSrc.refreshInterestRate();
        
		timestamp = await getBlockTimestamp();
        interestRate = await sweepSrc.interestRate();

		expect(await sweepSrc.periodStart()).to.equal(timestamp);
        expect(await sweepDst.interestRate()).to.equal(interestRate);
        expect(await sweepDst.periodStart()).to.equal(timestamp);
    })
})

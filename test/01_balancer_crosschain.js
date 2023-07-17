const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require('@openzeppelin/test-helpers');
const { toBN, increaseTime, Const, getBlockTimestamp, sendEth } = require("../utils/helper_functions");

const chainIdSrc = 1;
const chainIdDst = 2;

contract("Balancer - Crosschain message", async function () {
    before(async () => {
        [deployer, multisig, receiver, treasury, newAddress, newMinter] = await ethers.getSigners();
        TRANSFER_AMOUNT = toBN("100", 18);
        interestRate = 100; // daily rate 0.01%
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
            50 // 0.25%
        ]);

        sweepSrc = await srcProxy.deployed(Sweep);
		balancerSrc = await Balancer.deploy(sweepSrc.address, lzEndpointSrcMock.address);

        sweeprSrc = await Sweepr.deploy(Const.TRUE, lzEndpointSrcMock.address); // TRUE means governance chain
        await sweepSrc.setBalancer(balancerSrc.address);
        await sweepSrc.setArbSpread(300);
		await sweepSrc.setTWAPrice(999600);

        const dstProxy = await upgrades.deployProxy(Sweep, [
            lzEndpointDstMock.address,
            deployer.address,
            50 // 0.05%
        ]);

        sweepDst = await dstProxy.deployed(Sweep);
        balancerDst = await Balancer.deploy(sweepDst.address, lzEndpointDstMock.address);

        await sweepDst.setBalancer(balancerDst.address);
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

    it("not send crosschain message when sweepr is not set to balancer", async function () {
        await balancerSrc.refreshInterestRate();
        
        nextInterestRate = await sweepSrc.nextInterestRate();
        await increaseTime(Const.DAY * 2);

        expect(await sweepDst.nextInterestRate()).to.not.eq(nextInterestRate);
    })

    it("not send crosschain message when there is no chain added in sweepr", async function () {
        await balancerSrc.setSweepr(sweeprSrc.address);

        await time.increase(100);
		await time.advanceBlock();

        await balancerSrc.refreshInterestRate();
        
		interestRate = await sweepSrc.interestRate();

        expect(await sweepDst.interestRate()).to.not.equal(interestRate);
    })

    it("set interest rate successfully", async function () {
        await sweeprSrc.addChain(chainIdDst, balancerDst.address);

        await time.increase(100);
		await time.advanceBlock();

        await balancerSrc.refreshInterestRate();

        nextInterestRate = await sweepSrc.nextInterestRate();
        nextPeriodStart = await sweepSrc.nextPeriodStart();

        expect(await sweepDst.nextInterestRate()).to.equal(nextInterestRate);
        expect(await sweepDst.nextPeriodStart()).to.equal(nextPeriodStart);
    })
})

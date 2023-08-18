const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { toBN, increaseTime, Const, sendEth } = require("../utils/helper_functions");

const chainIdSrc = 1;
const chainIdDst = 2;
const chainIdExt = 3;

contract("Balancer - Crosschain message", async function () {
    before(async () => {
        [deployer, multisig, receiver, treasury, newAddress, newMinter] = await ethers.getSigners();
        TRANSFER_AMOUNT = toBN("100", 18);
        interestRate = 100; // daily rate 0.01%
        // ------------- Deployment of contracts -------------
        LZEndpointMock = await ethers.getContractFactory("LZEndpointMock");
        lzEndpointSrcMock = await LZEndpointMock.deploy(chainIdSrc);
        lzEndpointDstMock = await LZEndpointMock.deploy(chainIdDst);
        lzEndpointExtMock = await LZEndpointMock.deploy(chainIdExt);

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
        balancerSrc.setPeriod(604800); // 7 days

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

        const extProxy = await upgrades.deployProxy(Sweep, [
            lzEndpointExtMock.address,
            deployer.address,
            50 // 0.05%
        ]);

        sweepExt = await extProxy.deployed(Sweep);
        balancerExt = await Balancer.deploy(sweepExt.address, lzEndpointExtMock.address);

        await sweepDst.setBalancer(balancerDst.address);

        // internal bookkeeping for endpoints (not part of a real deploy, just for this test)
        lzEndpointSrcMock.setDestLzEndpoint(balancerDst.address, lzEndpointDstMock.address)
        lzEndpointDstMock.setDestLzEndpoint(balancerSrc.address, lzEndpointSrcMock.address)

        // set each contracts source address so it can send to each other
        dstPath = ethers.utils.solidityPack(["address", "address"], [balancerDst.address, balancerSrc.address])
        srcPath = ethers.utils.solidityPack(["address", "address"], [balancerSrc.address, balancerDst.address])

        await balancerSrc.setTrustedRemote(chainIdDst, dstPath) // for A, set B
        await balancerDst.setTrustedRemote(chainIdSrc, srcPath) // for B, set A
    });

    it("not send crosschain message when sweepr is not set to balancer", async function () {
        await balancerSrc.refreshInterestRate();
        
        nextInterestRate = await sweepSrc.nextInterestRate();
        await increaseTime(Const.DAY * 2);

        expect(await sweepDst.nextInterestRate()).to.not.eq(nextInterestRate);
    })

    it("not send crosschain message when there is no chain added in sweepr", async function () {
        await expect(balancerSrc.setSweepr(Const.ADDRESS_ZERO))
            .to.be.revertedWithCustomError(balancerSrc, "ZeroAddressDetected");
        await balancerSrc.setSweepr(sweeprSrc.address);

        await increaseTime(100);

        // refresh the interest rate through execute
        await balancerSrc.execute(0, false, 1e6, 2000);
        
		interestRate = await sweepSrc.nextInterestRate();
        expect(await sweepDst.nextInterestRate()).to.not.equal(interestRate);
    })

    it("not trusted remote", async function () {
        await sweeprSrc.addChain(chainIdExt, balancerExt.address);

        await expect(balancerSrc.refreshInterestRate())
            .to.be.revertedWithCustomError(balancerSrc, "NotTrustedRemote");

        await sweeprSrc.removeChain(Const.ZERO);
    });

    it("set interest rate successfully", async function () {
        await sweeprSrc.addChain(chainIdDst, balancerDst.address);

        await increaseTime(100);

        await expect(balancerSrc.refreshInterestRate())
            .to.be.revertedWithCustomError(balancerSrc, "NotEnoughETH");

        await sendEth(balancerSrc.address);
        await balancerSrc.refreshInterestRate();

        balanceBefore = await ethers.provider.getBalance(balancerSrc.address);
        await balancerSrc.recoverEther();
        balanceAfter = await ethers.provider.getBalance(balancerSrc.address);

        nextInterestRate = await sweepSrc.nextInterestRate();
        nextPeriodStart = await sweepSrc.nextPeriodStart();

        expect(balanceBefore).to.above(Const.ZERO);
        expect(balanceAfter).to.equal(Const.ZERO);
        expect(await sweepDst.nextInterestRate()).to.equal(nextInterestRate);
        expect(await sweepDst.nextPeriodStart()).to.equal(nextPeriodStart);
    })
})

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { Const, toBN, increaseTime, getBlockTimestamp } = require("../utils/helper_functions");

contract("VestingApprover", async function () {
	before(async () => {
		[owner, multisig, distributor, sender, receiver, other, lzEndpoint] = await ethers.getSigners();
		VESTING_TIME = 1000;
		VESTING_AMOUNT = toBN("1000", 18);
		SWEEPR_MINT_AMOUNT = toBN("1500", 18);
		// ------------- Deployment of contracts -------------
		Sweepr = await ethers.getContractFactory("SweeprCoin");
		VestingApprover = await ethers.getContractFactory("VestingApprover");
		sweepr = await Sweepr.deploy(Const.TRUE, lzEndpoint.address);
		vestingApprover = await VestingApprover.deploy(sweepr.address);
	});

	it('Send all vesting Sweepr amount to distributor address ', async () => {
		// mint sweepr for TokenDstributor contract
		await sweepr.connect(owner).mint(distributor.address, SWEEPR_MINT_AMOUNT);
		expect(await sweepr.balanceOf(distributor.address)).to.equal(SWEEPR_MINT_AMOUNT);

		// set transfer approver
		await expect(sweepr.connect(owner).setTransferApprover(Const.ADDRESS_ZERO))
			.to.be.revertedWithCustomError(sweepr, "ZeroAddressDetected");
		await sweepr.connect(owner).setTransferApprover(vestingApprover.address);
	});

	it("Should check input parameters for createVestingSchedule method", async function () {
		const time = Date.now();

		await expect(
			vestingApprover.createVestingSchedule(
				Const.ADDRESS_ZERO,
				time,
				1000,
				1000
			)
		).to.be.revertedWithCustomError(VestingApprover, "ZeroAddressDetected");

		await expect(
			vestingApprover.createVestingSchedule(
				sender.address,
				0,
				1000,
				10001
			)
		).to.be.revertedWithCustomError(VestingApprover, "ZeroAmountDetected");

		await expect(
			vestingApprover.createVestingSchedule(
				sender.address,
				time,
				0,
				1000
			)
		).to.be.revertedWithCustomError(VestingApprover, "ZeroAmountDetected");

		await expect(
			vestingApprover.createVestingSchedule(
				sender.address,
				time,
				1000,
				0
			)
		).to.be.revertedWithCustomError(VestingApprover, "ZeroAmountDetected");
	});

	it("create vesting schedule successfully", async function () {
		expect(await vestingApprover.getVestingSchedulesCount()).to.be.equal(Const.ZERO);
		START_TIME = await getBlockTimestamp() + VESTING_TIME;

		await vestingApprover.createVestingSchedule(
			distributor.address,
			START_TIME,
			VESTING_TIME,
			VESTING_AMOUNT
		);

		expect(await vestingApprover.getVestingSchedulesCount()).to.be.equal(1);

		beneficiary = await vestingApprover.beneficiaries(0);
		expect(beneficiary).to.equal(distributor.address);

		schedule = await vestingApprover.vestingSchedules(distributor.address);
		expect(schedule.startTime).to.equal(START_TIME);
		expect(schedule.vestingTime).to.equal(VESTING_TIME);

		expect(await vestingApprover.getLockedAmount(distributor.address)).to.be.equal(VESTING_AMOUNT);
	})

	it("check vesting schedules", async function () {
		await expect(vestingApprover.getVestingSchedule(Const.ADDRESS_ZERO))
			.to.be.revertedWithCustomError(vestingApprover, "ZeroAddressDetected");

		schedule = await vestingApprover.getVestingSchedule(owner.address);
		expect(schedule.startTime).to.equal(Const.ZERO)
		expect(schedule.vestingTime).to.equal(Const.ZERO)
		expect(schedule.vestingAmount).to.equal(Const.ZERO)
			
		schedule = await vestingApprover.getVestingSchedule(distributor.address);
		expect(schedule.startTime).to.equal(START_TIME)
		expect(schedule.vestingTime).to.equal(VESTING_TIME)
		expect(schedule.vestingAmount).to.equal(VESTING_AMOUNT)
	})

	it("checkTransfer() should be called only from Sweepr contract", async function () {
		await expect(vestingApprover.connect(owner).checkTransfer(
			distributor.address,
			sender.address,
			VESTING_AMOUNT
		)).to.be.revertedWithCustomError(VestingApprover, 'NotSweepr');
	})

	it("revert transfer when balance - send_amount < locked_amount before start time", async function () {
		lockedAmount = await vestingApprover.getLockedAmount(distributor.address);
		expect(lockedAmount).to.equal(VESTING_AMOUNT);

		senderBalance = await sweepr.balanceOf(distributor.address);
		expect(senderBalance.sub(VESTING_AMOUNT)).to.lessThan(lockedAmount);

		await expect(sweepr.connect(distributor).transfer(sender.address, VESTING_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'TransferNotAllowed');

		expect(senderBalance.sub(VESTING_AMOUNT.div(2))).to.equal(lockedAmount);
		await sweepr.connect(distributor).transfer(sender.address, VESTING_AMOUNT.div(2))

		expect(await sweepr.balanceOf(sender.address)).to.equal(VESTING_AMOUNT.div(2));
	})

	it("allow transfer when receiver is not beneficiary list", async function () {
		schedule = await vestingApprover.vestingSchedules(sender.address);
		expect(schedule.beneficiary).to.equal(Const.ADDRESS_ZERO);

		await sweepr.connect(sender).transfer(other.address, VESTING_AMOUNT.div(2));

		expect(await sweepr.balanceOf(other.address)).to.equal(VESTING_AMOUNT.div(2));
	})

	it("transfer token", async function () {
		// set time to half the vesting period
		HALF_TIME = VESTING_TIME + VESTING_TIME / 2;
		await increaseTime(HALF_TIME);

		lockedAmount = await vestingApprover.getLockedAmount(distributor.address);

		senderBalance = await sweepr.balanceOf(distributor.address);
		expect(senderBalance.sub(VESTING_AMOUNT)).to.lessThan(lockedAmount);

		// transfer should be reverted if balance - send_amount < locked_amount
		await expect(sweepr.connect(distributor).transfer(sender.address, VESTING_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'TransferNotAllowed');

		await sweepr.connect(owner).mint(distributor.address, VESTING_AMOUNT);

		senderBalance = await sweepr.balanceOf(distributor.address);
		expect(senderBalance.sub(VESTING_AMOUNT.div(2))).to.above(lockedAmount);

		await sweepr.connect(distributor).transfer(sender.address, VESTING_AMOUNT.div(2));
		expect(await sweepr.balanceOf(sender.address)).to.equal(VESTING_AMOUNT.div(2));

		// set time to full vesting period
		await increaseTime(HALF_TIME);

		expect(await vestingApprover.getLockedAmount(distributor.address)).to.equal(Const.ZERO);

		// sender can transfer full balance
		senderBalance = await sweepr.balanceOf(distributor.address);
		await sweepr.connect(distributor).transfer(sender.address, senderBalance);
		expect(await sweepr.balanceOf(distributor.address)).to.equal(Const.ZERO);
	})

	it("revert transfer when transfer amount exceeds locked amount", async function () {
		expect(await sweepr.balanceOf(distributor.address)).to.equal(Const.ZERO);

		await expect(sweepr.connect(distributor).transfer(other.address, VESTING_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'TransferNotAllowed');
	})

	it("remove vesting schedule", async function () {
		expect(await vestingApprover.getVestingSchedulesCount()).to.be.equal(1);

		// Confirm itemIndex = 0 is distributor
		expect(await vestingApprover.beneficiaries(0)).to.be.equal(distributor.address);

		await vestingApprover.removeSchedule(0); // remove schedule for distributor
		expect(await vestingApprover.getVestingSchedulesCount()).to.be.equal(Const.ZERO);

		schedule = await vestingApprover.vestingSchedules(distributor.address);
		expect(schedule.beneficiary).to.equal(Const.ADDRESS_ZERO);
	})
});

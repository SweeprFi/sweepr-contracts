const { expect } = require("chai");
const { ethers } = require("hardhat");
const { Const, toBN } = require("../utils/helper_functions");

contract("VestingApprover", async function () {
	before(async () => {
		[owner, multisig, distributor, sender, other, lzEndpoint] = await ethers.getSigners();
		// ------------- Deployment of contracts -------------
		Sweepr = await ethers.getContractFactory("SweeprCoin");
		VestingApprover = await ethers.getContractFactory("VestingApproverMock");

      	START_TIME = 1622551248;
      	VESTING_TIME = 1000;
      	VESTING_AMOUNT = toBN("1000", 18);
		SWEEPR_MINT_AMOUNT = toBN("1500", 18);

		sweepr = await Sweepr.deploy(Const.TRUE, lzEndpoint.address);

		vestingApprover = await VestingApprover.deploy(sweepr.address);
	});

	it('Send all vesting Sweepr amount to distributor address ', async () => {
		// mint sweepr for TokenDstributor contract
		await sweepr.connect(owner).mint(distributor.address, SWEEPR_MINT_AMOUNT);
		expect(await sweepr.balanceOf(distributor.address)).to.equal(SWEEPR_MINT_AMOUNT);

		// set transfer approver
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
	});

	it("create vesting schedule successfully", async function () {
		expect(await vestingApprover.getVestingSchedulesCount()).to.be.equal(Const.ZERO);

		await vestingApprover.createVestingSchedule(
			sender.address,
			START_TIME,
			VESTING_TIME,
			VESTING_AMOUNT
		);

		expect(await vestingApprover.getVestingSchedulesCount()).to.be.equal(1);

		beneficiary = await vestingApprover.beneficiaries(0);
		expect(beneficiary).to.equal(sender.address);

		schedule =await vestingApprover.vestingSchedules(sender.address);
		expect(schedule.startTime).to.equal(START_TIME);
		expect(schedule.vestingTime).to.equal(VESTING_TIME);

		expect(
			await vestingApprover.getLockedAmount(sender.address)
		  ).to.be.equal(0);
	})

	it("checkTransfer() should be called only from Sweepr contract", async function () {
		await expect(vestingApprover.connect(owner).checkTransfer(
			distributor.address,
			sender.address,
			VESTING_AMOUNT
		)).to.be.revertedWithCustomError(VestingApprover, 'NotSweepr');
	})

	it("revert transfer when receiver is not beneficiary list", async function () {
		schedule = await vestingApprover.vestingSchedules(other.address);
		expect(schedule.beneficiary).to.equal(Const.ADDRESS_ZERO);

		await expect(sweepr.connect(distributor).transfer(other.address, VESTING_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'TransferNotAllowed');
	})

	it("transfer token", async function () {
		// set time to half the vesting period
		halfTime = START_TIME + VESTING_TIME / 2;
		await vestingApprover.setCurrentTime(halfTime);

		expect(
			await vestingApprover.getLockedAmount(sender.address)
		).to.equal(VESTING_AMOUNT.div(2));

		// transfer should be reverted if transfer amount is larger than vested amount
		await expect(sweepr.connect(distributor).transfer(sender.address, VESTING_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'TransferNotAllowed');
			
		await sweepr.connect(distributor).transfer(sender.address, VESTING_AMOUNT.div(2));

		expect(await sweepr.balanceOf(sender.address)).to.equal(VESTING_AMOUNT.div(2));

		schedule = await vestingApprover.vestingSchedules(sender.address);
		expect(schedule.transferredAmount).to.equal(VESTING_AMOUNT.div(2));

		// set time to full vesting period
		fullTime = START_TIME + VESTING_TIME;
		await vestingApprover.setCurrentTime(fullTime);

		expect(
			await vestingApprover.getLockedAmount(sender.address)
		).to.equal(VESTING_AMOUNT.div(2));

		// transfer should be reverted if transfer amount is larger than vested amount
		await expect(sweepr.connect(distributor).transfer(sender.address, VESTING_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'TransferNotAllowed');

		await sweepr.connect(distributor).transfer(sender.address, VESTING_AMOUNT.div(2));

		expect(await sweepr.balanceOf(sender.address)).to.equal(VESTING_AMOUNT);
	
		schedule = await vestingApprover.vestingSchedules(sender.address);
		expect(schedule.transferredAmount).to.equal(VESTING_AMOUNT);

		// set time to over vesting period
		overTime = START_TIME + VESTING_TIME * 3 / 2;
		await vestingApprover.setCurrentTime(overTime);

		expect(
			await vestingApprover.getLockedAmount(sender.address)
		).to.equal(Const.ZERO);

		// transfer should be reverted if vested amount is zero
		await expect(sweepr.connect(distributor).transfer(sender.address, VESTING_AMOUNT.div(2)))
			.to.be.revertedWithCustomError(Sweepr, 'TransferNotAllowed');
	})

	it("revert transfer when sender is in beneficiary list", async function () {
		// create schedule for other user
		await vestingApprover.createVestingSchedule(
			other.address,
			START_TIME,
			VESTING_TIME,
			VESTING_AMOUNT
		);

		expect(await vestingApprover.getVestingSchedulesCount()).to.be.equal(2);

		schedule = await vestingApprover.vestingSchedules(other.address);
		expect(schedule.beneficiary).to.equal(other.address);

		fullTime = START_TIME + VESTING_TIME;
		await vestingApprover.setCurrentTime(fullTime);

		expect(
			await vestingApprover.getLockedAmount(other.address)
		).to.equal(VESTING_AMOUNT);

		await expect(sweepr.connect(sender).transfer(other.address, VESTING_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'TransferNotAllowed');
	})

	it("revert transfer when sender has not enough balance", async function () {
		senderBalance = await sweepr.balanceOf(distributor.address);
		vestedAmount = await vestingApprover.getLockedAmount(other.address);

		expect(senderBalance).to.lessThan(vestedAmount);

		await expect(sweepr.connect(distributor).transfer(other.address, VESTING_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'TransferNotAllowed');
	})

	it("remove vesting schedule", async function () {
		expect(await vestingApprover.getVestingSchedulesCount()).to.be.equal(2);

		// Confirm itemIndex = 1 is other user
		expect(await vestingApprover.beneficiaries(1)).to.be.equal(other.address);

		await vestingApprover.removeSchedule(1); // remove schedule for other
		expect(await vestingApprover.getVestingSchedulesCount()).to.be.equal(1);

		schedule = await vestingApprover.vestingSchedules(other.address);
		expect(schedule.beneficiary).to.equal(Const.ADDRESS_ZERO);
	})
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { Const, toBN } = require("../utils/helper_functions");

contract("TokenDistributorApprover", async function () {
	before(async () => {
		[owner, distributor, newDistributor, sender, other, lzEndpoint] = await ethers.getSigners();
		
		SWEEPR_MINT_AMOUNT = toBN("1500", 18);
		SWEEPR_BURN_AMOUNT = toBN("500", 18);
		TRANSFER_AMOUNT = toBN("100", 18);

		// ------------- Deployment of contracts -------------
		Sweepr = await ethers.getContractFactory("SweeprCoin");
		TokenDistributorApprover = await ethers.getContractFactory("TokenDistributorApprover");

		sweepr = await Sweepr.deploy(Const.TRUE, lzEndpoint.address);

		tokenDistributorApprover = await TokenDistributorApprover.deploy(sweepr.address, distributor.address);
		await sweepr.connect(owner).setTransferApprover(tokenDistributorApprover.address);
	});

	it('Allow transfer when minting & burning', async () => {
		// mint
		expect(await sweepr.balanceOf(distributor.address)).to.equal(Const.ZERO);

		await sweepr.connect(owner).mint(distributor.address, SWEEPR_MINT_AMOUNT);
		expect(await sweepr.balanceOf(distributor.address)).to.equal(SWEEPR_MINT_AMOUNT);

		// burn 
		await sweepr.connect(distributor).burn(SWEEPR_BURN_AMOUNT);
		expect(await sweepr.balanceOf(distributor.address)).to.equal(SWEEPR_MINT_AMOUNT.sub(SWEEPR_BURN_AMOUNT));
	});

	it('Allow transfer when sender is token distributor', async () => {
		expect(await sweepr.balanceOf(sender.address)).to.equal(Const.ZERO);
		await sweepr.connect(distributor).transfer(sender.address, TRANSFER_AMOUNT);
		expect(await sweepr.balanceOf(sender.address)).to.equal(TRANSFER_AMOUNT);
	});

	it('Revert transfer when sender or receiver is not token distributor', async () => {
		await expect(sweepr.connect(sender).transfer(other.address, TRANSFER_AMOUNT))
			.to.be.revertedWithCustomError(Sweepr, 'TransferNotAllowed');
	});

	it('Allow transfer when receiver is token distributor', async () => {
		distributorBalancer = await sweepr.balanceOf(distributor.address);

		await sweepr.connect(sender).transfer(distributor.address, TRANSFER_AMOUNT);
		expect(await sweepr.balanceOf(distributor.address)).to.equal(distributorBalancer.add(TRANSFER_AMOUNT));
	});

	it('Revert setTokenDistributor() when caller is not owner', async () => {
		await expect(tokenDistributorApprover.connect(other).setTokenDistributor(distributor.address))
			.to.be.revertedWith("Ownable: caller is not the owner");
	});

	it('Set TokenDistributor correctly', async () => {
		await tokenDistributorApprover.setTokenDistributor(newDistributor.address);

		expect(await tokenDistributorApprover.tokenDistributor()).to.equal(newDistributor.address);
	});
});

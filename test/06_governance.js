const { expect } = require('chai');
const { ethers } = require("hardhat");
const { addresses, roles } = require("../utils/address");
const { time, expectRevert } = require('@openzeppelin/test-helpers');
let account;

contract('Governance - Local', async (accounts) => {
	before(async () => {
		// constants
		PROPOSER = accounts[0];
		NEW_MINTER = accounts[1];
		USER1 = accounts[2];
		USER2 = accounts[3];
		USER3 = accounts[4];
		USER4 = accounts[5];
		OWNER_SWEEPER = addresses.owner;
		APPROVER = '0x59490d4dcC479B3717A6Eb289Db929E125E86eB1'; // approver blacklist
		MINT_AMOUNT = ethers.utils.parseUnits("100000", 18);
		SWEEP_AMOUNT = ethers.utils.parseUnits("1400", 18);
		TRANSFER_AMOUNT = ethers.utils.parseUnits("100", 18);
		REMANENT_AMOUNT = ethers.utils.parseUnits("139600", 18);
		ZERO = 0;
		PROPOSAL_ACTIVE = 1;
		PROPOSAL_CANCELED = 2;
		PROPOSAL_SUCCEEDED = 4;
		PROPOSAL_QUEUED = 5;
		PROPOSAL_EXECUTED = 7;
		PROPOSER_ROLE = roles.PROPOSER_ROLE;
		EXECUTOR_ROLE = roles.EXECUTOR_ROLE;
		CANCELLER_ROLE = roles.CANCELLER_ROLE;
		// contracts
		Sweep = await ethers.getContractFactory("SweepMock");
		const Proxy = await upgrades.deployProxy(Sweep);
		sweep = await Proxy.deployed(Sweep);
		await sweep.setTreasury(addresses.treasury);

		timelock = await ethers.getContractAt("TimelockController", addresses.timelock);

		SWEEPER = await ethers.getContractFactory("SWEEPER");
		Governance = await ethers.getContractFactory("SweepGovernor");

		// deploys
		sweeper = await SWEEPER.deploy(sweep.address, APPROVER, addresses.treasury);
		governance = await Governance.deploy(sweeper.address, addresses.timelock, 10);

		await sweeper.setAllowMinting(true);
		await sweeper.setAllowBurning(true);
		await sweeper.setTransferApprover(APPROVER);
		// Set SWEEPER price to 1: 
		await sweeper.setSWEEPERPrice(10000);

		await impersonate(OWNER_SWEEPER);
		await timelock.connect(account).grantRole(PROPOSER_ROLE, governance.address);
		await timelock.connect(account).grantRole(EXECUTOR_ROLE, governance.address);
		await timelock.connect(account).grantRole(CANCELLER_ROLE, PROPOSER);
	});

	async function impersonate(address) {
		await hre.network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [address]
		});

		account = await ethers.getSigner(address);
	}

	it('delegates votes correctly', async () => {
		await sweep.addMinter(PROPOSER, MINT_AMOUNT);
		await impersonate(PROPOSER);
		await sweep.connect(account).minter_mint(PROPOSER, MINT_AMOUNT);
		await sweep.connect(account).approve(sweeper.address, MINT_AMOUNT);
		await sweeper.connect(account).buySWEEPER(SWEEP_AMOUNT);

		await sweeper.connect(account).transfer(USER1, TRANSFER_AMOUNT);
		await sweeper.connect(account).transfer(USER2, TRANSFER_AMOUNT);
		await sweeper.connect(account).transfer(USER3, TRANSFER_AMOUNT);
		await sweeper.connect(account).transfer(USER4, TRANSFER_AMOUNT);

		expect(await sweeper.getVotes(PROPOSER)).to.equal(ZERO);
		expect(await sweeper.getVotes(USER1)).to.equal(ZERO);
		expect(await sweeper.getVotes(USER2)).to.equal(ZERO);
		expect(await sweeper.getVotes(USER3)).to.equal(ZERO);
		expect(await sweeper.getVotes(USER4)).to.equal(ZERO);

		// delegate
		await sweeper.connect(account).delegate(PROPOSER);
		await impersonate(USER1);
		await sweeper.connect(account).delegate(USER1);
		await impersonate(USER2);
		await sweeper.connect(account).delegate(USER2);
		await impersonate(USER3);
		await sweeper.connect(account).delegate(USER3);
		await impersonate(USER4);
		await sweeper.connect(account).delegate(USER4);

		expect(await sweeper.delegates(PROPOSER)).to.equal(PROPOSER);
		expect(await sweeper.delegates(USER1)).to.equal(USER1);
		expect(await sweeper.delegates(USER2)).to.equal(USER2);
		expect(await sweeper.delegates(USER3)).to.equal(USER3);
		expect(await sweeper.delegates(USER4)).to.equal(USER4);

		expect(await sweeper.getVotes(PROPOSER)).to.equal(REMANENT_AMOUNT);
		expect(await sweeper.getVotes(USER1)).to.equal(TRANSFER_AMOUNT);
		expect(await sweeper.getVotes(USER2)).to.equal(TRANSFER_AMOUNT);
		expect(await sweeper.getVotes(USER3)).to.equal(TRANSFER_AMOUNT);
		expect(await sweeper.getVotes(USER4)).to.equal(TRANSFER_AMOUNT);
	});

	it('proposes only who has enough sweeper', async () => {
		// Transfer sweep ownership to governance
		await sweep.transferOwnership(addresses.timelock);

		calldata = sweep.interface.encodeFunctionData('acceptOwnership', []);
		proposeDescription = "Proposal #1: Accept ownership";
		descriptionHash = ethers.utils.id(proposeDescription);

		await impersonate(PROPOSER);
		await governance.propose([sweep.address], [0], [calldata], proposeDescription);

		// Advance one block so the voting can begin
		await time.increase(15);
		await time.advanceBlock();

		proposal_id = await governance.hashProposal([sweep.address], [0], [calldata], descriptionHash);
		expect(await governance.state(proposal_id)).to.equal(PROPOSAL_ACTIVE);
	});

	it('reverts propose if proposer votes below proposal threshold', async () => {
		calldata = sweep.interface.encodeFunctionData('addMinter', [NEW_MINTER, MINT_AMOUNT]);
		proposeDescription = "Proposal #2: Adding new minter";

		await impersonate(USER1);
		await expectRevert(
			governance.connect(account).propose([sweep.address], [0], [calldata], proposeDescription),
			'Governor: proposer votes below proposal threshold'
		);
	});

	it('revert queuing proposal if voting period is not finished', async () => {
		calldata = sweep.interface.encodeFunctionData('acceptOwnership', []);
		proposeDescription = "Proposal #1: Accept ownership";
		descriptionHash = ethers.utils.id(proposeDescription);

		await expectRevert(
			governance.queue([sweep.address], [0], [calldata], descriptionHash),
			'Governor: proposal not successful'
		);
	});

	it('Revert executing proposal if proposal state is not success', async () => {
		await expectRevert(
			governance.execute([sweep.address], [0], [calldata], descriptionHash),
			'Governor: proposal not successful'
		);
	});

	it('cast votes', async () => {
		expect(await governance.state(proposal_id)).to.equal(PROPOSAL_ACTIVE);
		expect(await governance.hasVoted(proposal_id, PROPOSER)).to.equal(false);
		expect(await governance.hasVoted(proposal_id, USER1)).to.equal(false);
		expect(await governance.hasVoted(proposal_id, USER2)).to.equal(false);
		expect(await governance.hasVoted(proposal_id, USER3)).to.equal(false);
		expect(await governance.hasVoted(proposal_id, USER4)).to.equal(false);

		votes = await governance.proposalVotes(proposal_id)
		expect(votes.againstVotes).to.equal(ZERO);
		expect(votes.forVotes).to.equal(ZERO);
		expect(votes.abstainVotes).to.equal(ZERO);

		await impersonate(PROPOSER);
		await governance.connect(account).castVote(proposal_id, 1);
		await impersonate(USER1);
		await governance.connect(account).castVote(proposal_id, 1);
		await impersonate(USER2);
		await governance.connect(account).castVote(proposal_id, 1);
		await impersonate(USER3);
		await governance.connect(account).castVote(proposal_id, 1);
		await impersonate(USER4);
		await governance.connect(account).castVote(proposal_id, 2);

		expect(await governance.hasVoted(proposal_id, PROPOSER)).to.equal(true);
		expect(await governance.hasVoted(proposal_id, USER1)).to.equal(true);
		expect(await governance.hasVoted(proposal_id, USER2)).to.equal(true);
		expect(await governance.hasVoted(proposal_id, USER3)).to.equal(true);
		expect(await governance.hasVoted(proposal_id, USER4)).to.equal(true);

		votes = await governance.proposalVotes(proposal_id)
		expect(votes.againstVotes).to.equal(ZERO);
		expect(votes.abstainVotes).to.equal(TRANSFER_AMOUNT);
		expect(votes.forVotes).to.equal((SWEEP_AMOUNT.mul(100)).sub(TRANSFER_AMOUNT));
	});

	it('queues proposal correctly', async () => {
		await time.increase(300);
		await time.advanceBlock();

		expect(await governance.state(proposal_id)).to.equal(PROPOSAL_SUCCEEDED);
		await governance.connect(account).queue([sweep.address], [0], [calldata], descriptionHash);
		expect(await governance.state(proposal_id)).to.equal(PROPOSAL_QUEUED);
	});

	it('Revert cancel proposal if caller is not canceller(owner)', async () => {
		await impersonate(USER1);
		await expectRevert(
			governance.connect(account).cancel([sweep.address], [0], [calldata], descriptionHash),
			'Governor: only canceller'
		);
	});

	it('executes proposal correctly', async () => {
		delay = await timelock.getMinDelay();
		await time.increase(parseInt(delay));
		await time.advanceBlock();

		expect(await governance.state(proposal_id)).to.equal(PROPOSAL_QUEUED);
		await governance.connect(account).execute([sweep.address], [0], [calldata], descriptionHash);
		expect(await governance.state(proposal_id)).to.equal(PROPOSAL_EXECUTED);
	});

	it('Cancel proposal', async () => {
		calldata = sweep.interface.encodeFunctionData('addMinter', [NEW_MINTER, MINT_AMOUNT]);
		proposeDescription = "Proposal #3: Adding new minter";
		descriptionHash = ethers.utils.id(proposeDescription);

		await impersonate(PROPOSER);
		await governance.propose([sweep.address], [0], [calldata], proposeDescription);

		await time.increase(15);
		await time.advanceBlock();

		proposal_id = await governance.hashProposal([sweep.address], [0], [calldata], descriptionHash);
		expect(await governance.state(proposal_id)).to.equal(PROPOSAL_ACTIVE);

		await governance.connect(account).cancel([sweep.address], [0], [calldata], descriptionHash)

		proposal_id = await governance.hashProposal([sweep.address], [0], [calldata], descriptionHash);
		expect(await governance.state(proposal_id)).to.equal(PROPOSAL_CANCELED);
	});
});

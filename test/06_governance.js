const { expect } = require('chai');
const { ethers } = require("hardhat");
const { addresses } = require("../utils/address");
const { time } = require('@openzeppelin/test-helpers');
const { impersonate, Const, toBN } = require('../utils/helper_functions');
let account;

contract('Governance', async (accounts) => {
	before(async () => {
		// constants
		PROPOSER = accounts[0];
		NEW_MINTER = accounts[1];
		USER1 = accounts[2];
		USER2 = accounts[3];
		USER3 = accounts[4];
		USER4 = accounts[5];
		LZENDPOINT = accounts[6];
		OWNER_SWEEPER = addresses.owner;
		MINT_AMOUNT = toBN("100000", 18);
		SWEEP_AMOUNT = toBN("1400", 18);
		TRANSFER_AMOUNT = toBN("100", 18);
		REMANENT_AMOUNT = toBN("139600", 18);
		// contracts
		Sweep = await ethers.getContractFactory("SweepMock");
		const Proxy = await upgrades.deployProxy(Sweep, [LZENDPOINT]);
		sweep = await Proxy.deployed(Sweep);
		await sweep.setTreasury(addresses.treasury);

		timelock = await ethers.getContractAt("TimelockController", addresses.timelock);

		SWEEPER = await ethers.getContractFactory("SWEEPER");
		Governance = await ethers.getContractFactory("SweepGovernor");

		// deploys
		sweeper = await SWEEPER.deploy(sweep.address, addresses.treasury);
		governance = await Governance.deploy(sweeper.address, addresses.timelock, 10);

		await sweeper.setAllowMinting(Const.TRUE);
		await sweeper.setAllowBurning(Const.TRUE);
		// Set SWEEPER price to 1: 
		await sweeper.setSWEEPERPrice(10000);

		account = await impersonate(OWNER_SWEEPER);
		await timelock.connect(account).grantRole(Const.PROPOSER_ROLE, governance.address);
		await timelock.connect(account).grantRole(Const.EXECUTOR_ROLE, governance.address);
		await timelock.connect(account).grantRole(Const.CANCELLER_ROLE, PROPOSER);
	});

	it('delegates votes correctly', async () => {
		await sweep.addMinter(PROPOSER, MINT_AMOUNT);
		account = await impersonate(PROPOSER);
		await sweep.connect(account).minter_mint(PROPOSER, MINT_AMOUNT);
		await sweep.connect(account).approve(sweeper.address, MINT_AMOUNT);
		await sweeper.connect(account).buySWEEPER(SWEEP_AMOUNT);

		await sweeper.connect(account).transfer(USER1, TRANSFER_AMOUNT);
		await sweeper.connect(account).transfer(USER2, TRANSFER_AMOUNT);
		await sweeper.connect(account).transfer(USER3, TRANSFER_AMOUNT);
		await sweeper.connect(account).transfer(USER4, TRANSFER_AMOUNT);

		expect(await sweeper.getVotes(PROPOSER)).to.equal(Const.ZERO);
		expect(await sweeper.getVotes(USER1)).to.equal(Const.ZERO);
		expect(await sweeper.getVotes(USER2)).to.equal(Const.ZERO);
		expect(await sweeper.getVotes(USER3)).to.equal(Const.ZERO);
		expect(await sweeper.getVotes(USER4)).to.equal(Const.ZERO);

		// delegate
		await sweeper.connect(account).delegate(PROPOSER);
		account = await impersonate(USER1);
		await sweeper.connect(account).delegate(USER1);
		account = await impersonate(USER2);
		await sweeper.connect(account).delegate(USER2);
		account = await impersonate(USER3);
		await sweeper.connect(account).delegate(USER3);
		account = await impersonate(USER4);
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

		// Make proposal to transfer ownership to OWNER_SWEEPER
		calldata = sweep.interface.encodeFunctionData('transferOwnership', [OWNER_SWEEPER]);
		proposeDescription = "Proposal #1: transfer ownership";
		descriptionHash = ethers.utils.id(proposeDescription);

		account = await impersonate(PROPOSER);
		await governance.propose([sweep.address], [0], [calldata], proposeDescription);

		// Advance one block so the voting can begin
		await time.increase(15);
		await time.advanceBlock();

		proposal_id = await governance.hashProposal([sweep.address], [0], [calldata], descriptionHash);
		expect(await governance.state(proposal_id)).to.equal(Const.PROPOSAL_ACTIVE);
	});

	it('reverts propose if proposer votes below proposal threshold', async () => {
		calldata = sweep.interface.encodeFunctionData('addMinter', [NEW_MINTER, MINT_AMOUNT]);
		proposeDescription = "Proposal #2: Adding new minter";

		account = await impersonate(USER1);
		await expect(governance.connect(account).propose([sweep.address], [0], [calldata], proposeDescription))
			.to.be.revertedWith('Governor: proposer votes below proposal threshold');
	});

	it('revert queuing proposal if voting period is not finished', async () => {
		calldata = sweep.interface.encodeFunctionData('transferOwnership', [OWNER_SWEEPER]);
		proposeDescription = "Proposal #1: transfer ownership";
		descriptionHash = ethers.utils.id(proposeDescription);

		await expect(governance.queue([sweep.address], [0], [calldata], descriptionHash))
			.to.be.revertedWith('Governor: proposal not successful');
	});

	it('Revert executing proposal if proposal state is not success', async () => {
		await expect(governance.execute([sweep.address], [0], [calldata], descriptionHash))
			.to.be.revertedWith('Governor: proposal not successful');
	});

	it('cast votes', async () => {
		expect(await governance.state(proposal_id)).to.equal(Const.PROPOSAL_ACTIVE);
		expect(await governance.hasVoted(proposal_id, PROPOSER)).to.equal(Const.FALSE);
		expect(await governance.hasVoted(proposal_id, USER1)).to.equal(Const.FALSE);
		expect(await governance.hasVoted(proposal_id, USER2)).to.equal(Const.FALSE);
		expect(await governance.hasVoted(proposal_id, USER3)).to.equal(Const.FALSE);
		expect(await governance.hasVoted(proposal_id, USER4)).to.equal(Const.FALSE);

		votes = await governance.proposalVotes(proposal_id)
		expect(votes.againstVotes).to.equal(Const.ZERO);
		expect(votes.forVotes).to.equal(Const.ZERO);
		expect(votes.abstainVotes).to.equal(Const.ZERO);

		account = await impersonate(PROPOSER);
		await governance.connect(account).castVote(proposal_id, 1);
		account = await impersonate(USER1);
		await governance.connect(account).castVote(proposal_id, 1);
		account = await impersonate(USER2);
		await governance.connect(account).castVote(proposal_id, 1);
		account = await impersonate(USER3);
		await governance.connect(account).castVote(proposal_id, 1);
		account = await impersonate(USER4);
		await governance.connect(account).castVote(proposal_id, 2);

		expect(await governance.hasVoted(proposal_id, PROPOSER)).to.equal(Const.TRUE);
		expect(await governance.hasVoted(proposal_id, USER1)).to.equal(Const.TRUE);
		expect(await governance.hasVoted(proposal_id, USER2)).to.equal(Const.TRUE);
		expect(await governance.hasVoted(proposal_id, USER3)).to.equal(Const.TRUE);
		expect(await governance.hasVoted(proposal_id, USER4)).to.equal(Const.TRUE);

		votes = await governance.proposalVotes(proposal_id)
		expect(votes.againstVotes).to.equal(Const.ZERO);
		expect(votes.abstainVotes).to.equal(TRANSFER_AMOUNT);
		expect(votes.forVotes).to.equal((SWEEP_AMOUNT.mul(100)).sub(TRANSFER_AMOUNT));
	});

	it('queues proposal correctly', async () => {
		await time.increase(300);
		await time.advanceBlock();

		expect(await governance.state(proposal_id)).to.equal(Const.PROPOSAL_SUCCEEDED);
		await governance.connect(account).queue([sweep.address], [0], [calldata], descriptionHash);
		expect(await governance.state(proposal_id)).to.equal(Const.PROPOSAL_QUEUED);
	});

	it('Revert cancel proposal if caller is not canceller(owner)', async () => {
		account = await impersonate(USER1);
		await expect(governance.connect(account).cancel([sweep.address], [0], [calldata], descriptionHash))
			.to.be.revertedWith('Governor: only canceller');
	});

	it('executes proposal correctly', async () => {
		delay = await timelock.getMinDelay();
		await time.increase(parseInt(delay));
		await time.advanceBlock();

		expect(await governance.state(proposal_id)).to.equal(Const.PROPOSAL_QUEUED);
		await governance.connect(account).execute([sweep.address], [0], [calldata], descriptionHash);
		expect(await governance.state(proposal_id)).to.equal(Const.PROPOSAL_EXECUTED);
	});

	it('Cancel proposal', async () => {
		calldata = sweep.interface.encodeFunctionData('addMinter', [NEW_MINTER, MINT_AMOUNT]);
		proposeDescription = "Proposal #3: Adding new minter";
		descriptionHash = ethers.utils.id(proposeDescription);

		account = await impersonate(PROPOSER);
		await governance.propose([sweep.address], [0], [calldata], proposeDescription);

		await time.increase(15);
		await time.advanceBlock();

		proposal_id = await governance.hashProposal([sweep.address], [0], [calldata], descriptionHash);
		expect(await governance.state(proposal_id)).to.equal(Const.PROPOSAL_ACTIVE);

		await governance.connect(account).cancel([sweep.address], [0], [calldata], descriptionHash)

		proposal_id = await governance.hashProposal([sweep.address], [0], [calldata], descriptionHash);
		expect(await governance.state(proposal_id)).to.equal(Const.PROPOSAL_CANCELED);
	});
});

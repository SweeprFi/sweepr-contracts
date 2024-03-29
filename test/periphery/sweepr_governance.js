const { expect } = require('chai');
const { ethers } = require("hardhat");
const { deployments, wallets } = require("../../utils/constants");
const { time } = require('@openzeppelin/test-helpers');
const { impersonate, Const, toBN, sendEth } = require('../../utils/helper_functions');
let account;

contract('Sweepr Governance', async (accounts) => {
	before(async () => {
		// constants
		PROPOSER = accounts[0];
		NEW_MINTER = accounts[1];
		USER1 = accounts[2];
		USER2 = accounts[3];
		USER3 = accounts[4];
		USER4 = accounts[5];
		LZENDPOINT = accounts[6];
		TREASURY = accounts[7];
		OWNER_SWEEPR = wallets.multisig;
		MINT_AMOUNT = toBN("100000", 18);
		SWEEP_AMOUNT = toBN("1400", 18);
		SWEEPR_MINT_AMOUNT = toBN("10000", 18);
		TRANSFER_AMOUNT = toBN("100", 18);
		REMANENT_AMOUNT = toBN("9600", 18);
		USDC_AMOUNT = ethers.utils.parseUnits("20000", 6);
		SALE_AMOUNT = ethers.utils.parseUnits("10000", 18);
		SALE_PRICE = 1000000; // 1 USDC

		VOTING_DELAY = 1;
		VOTING_PERIOD = 10;
		PROPOSAL_THRESHOLD = toBN("1000", 18);
		VOTES_QUORUM = 40;
		NEW_VOTES_QUORUM = 20;
		// contracts
		Sweep = await ethers.getContractFactory("SweepMock");
		const Proxy = await upgrades.deployProxy(Sweep, [
			LZENDPOINT,
			OWNER_SWEEPR,
			2500 // 0.25%
		]);
		sweep = await Proxy.deployed(Sweep);

		await sendEth(OWNER_SWEEPR);
		user = await impersonate(OWNER_SWEEPR);
		await sweep.connect(user).setTreasury(TREASURY);

		timelockInstance = await ethers.getContractFactory("TimelockController");
		timelock = await timelockInstance.deploy(172800, [], [], OWNER_SWEEPR);

		SWEEPR = await ethers.getContractFactory("SweeprCoin");
		Governance = await ethers.getContractFactory("SweeprGovernor");
		TokenDistributor = await ethers.getContractFactory("TokenDistributor");

		ERC20 = await ethers.getContractFactory("USDCMock");
		usdc = await ERC20.deploy(6);

		// deploys
		sweepr = await SWEEPR.deploy(Const.TRUE, LZENDPOINT); // TRUE means governance chain

		tokenDistributor = await TokenDistributor.deploy(sweepr.address, TREASURY);
		governance = await Governance.deploy(
			sweepr.address,
			timelock.address,
			VOTING_DELAY,
			VOTING_PERIOD,
			PROPOSAL_THRESHOLD,
			VOTES_QUORUM
		);

		// Sets SWEEPR price to 1 SWEEP: 
		await sweepr.setPrice(1000000);

		// Mints SWEEPR to TokenDistributor
		await sweepr.mint(tokenDistributor.address, SWEEPR_MINT_AMOUNT);

		account = await impersonate(OWNER_SWEEPR);
		await timelock.connect(account).grantRole(Const.PROPOSER_ROLE, governance.address);
		await timelock.connect(account).grantRole(Const.EXECUTOR_ROLE, governance.address);
		await timelock.connect(account).grantRole(Const.CANCELLER_ROLE, PROPOSER);

		await usdc.transfer(account.address, USDC_AMOUNT);
	});

	it('support interface', async () => {
		// ERC165
		expect(await governance.supportsInterface('0x01ffc9a7')).to.equal(Const.TRUE);
		// any
		expect(await governance.supportsInterface('0x0000000A')).to.equal(Const.FALSE);
	});

	it('delegates votes correctly', async () => {
		tokenAmount = ethers.utils.parseUnits("10000", 6);
		await sweep.addMinter(PROPOSER, MINT_AMOUNT);
		account = await impersonate(PROPOSER);

		await tokenDistributor.allowSale(
			SALE_AMOUNT,
			account.address,
			SALE_PRICE,
			usdc.address
		);

		await usdc.connect(account).approve(tokenDistributor.address, tokenAmount);

		await sweep.connect(account).mint(MINT_AMOUNT);
		await sweep.connect(account).approve(tokenDistributor.address, MINT_AMOUNT);
		await tokenDistributor.connect(account).buy(tokenAmount);

		await sweepr.connect(account).transfer(USER1, TRANSFER_AMOUNT);
		await sweepr.connect(account).transfer(USER2, TRANSFER_AMOUNT);
		await sweepr.connect(account).transfer(USER3, TRANSFER_AMOUNT);
		await sweepr.connect(account).transfer(USER4, TRANSFER_AMOUNT);

		expect(await sweepr.getVotes(PROPOSER)).to.equal(Const.ZERO);
		expect(await sweepr.getVotes(USER1)).to.equal(Const.ZERO);
		expect(await sweepr.getVotes(USER2)).to.equal(Const.ZERO);
		expect(await sweepr.getVotes(USER3)).to.equal(Const.ZERO);
		expect(await sweepr.getVotes(USER4)).to.equal(Const.ZERO);

		// delegate
		await sweepr.connect(account).delegate(PROPOSER);
		account = await impersonate(USER1);
		await sweepr.connect(account).delegate(USER1);
		account = await impersonate(USER2);
		await sweepr.connect(account).delegate(USER2);
		account = await impersonate(USER3);
		await sweepr.connect(account).delegate(USER3);
		account = await impersonate(USER4);
		await sweepr.connect(account).delegate(USER4);

		expect(await sweepr.delegates(PROPOSER)).to.equal(PROPOSER);
		expect(await sweepr.delegates(USER1)).to.equal(USER1);
		expect(await sweepr.delegates(USER2)).to.equal(USER2);
		expect(await sweepr.delegates(USER3)).to.equal(USER3);
		expect(await sweepr.delegates(USER4)).to.equal(USER4);

		expect(await sweepr.getVotes(PROPOSER)).to.equal(REMANENT_AMOUNT);
		expect(await sweepr.getVotes(USER1)).to.equal(TRANSFER_AMOUNT);
		expect(await sweepr.getVotes(USER2)).to.equal(TRANSFER_AMOUNT);
		expect(await sweepr.getVotes(USER3)).to.equal(TRANSFER_AMOUNT);
		expect(await sweepr.getVotes(USER4)).to.equal(TRANSFER_AMOUNT);
	});

	it('proposes only who has enough sweepr', async () => {
		// Transfer sweep ownership to governance
		await sweep.transferOwnership(deployments.timelock);

		totalSupply = await sweepr.totalSupply();
		blockNumber = await ethers.provider.getBlockNumber();
		expect(await governance.quorum(blockNumber - 1)).to.equal(totalSupply.mul(VOTES_QUORUM).div(100));

		// Make proposal to update votes quorum to 20%
		calldata = governance.interface.encodeFunctionData('updateQuorumNumerator', [NEW_VOTES_QUORUM]);
		proposeDescription = "Proposal #1: update quorum to 20%";
		descriptionHash = ethers.utils.id(proposeDescription);

		account = await impersonate(PROPOSER);
		await governance.propose([governance.address], [0], [calldata], proposeDescription);

		// Advance one block so the voting can begin
		await time.increase(15);
		await time.advanceBlock();

		proposal_id = await governance.hashProposal([governance.address], [0], [calldata], descriptionHash);
		expect(await governance.state(proposal_id)).to.equal(Const.PROPOSAL_ACTIVE);
	});

	it('reverts propose if proposer votes below proposal threshold', async () => {
		calldata2 = sweep.interface.encodeFunctionData('addMinter', [NEW_MINTER, MINT_AMOUNT]);
		proposeDescription2 = "Proposal #2: Adding new minter";

		account = await impersonate(USER1);
		await expect(governance.connect(account).propose([sweep.address], [0], [calldata2], proposeDescription2))
			.to.be.revertedWith('Governor: proposer votes below proposal threshold');
	});

	it('revert queuing proposal if voting period is not finished', async () => {
		calldata = governance.interface.encodeFunctionData('updateQuorumNumerator', [NEW_VOTES_QUORUM]);
		proposeDescription = "Proposal #1: update quorum to 20%";
		descriptionHash = ethers.utils.id(proposeDescription);

		await expect(governance.queue([governance.address], [0], [calldata], descriptionHash))
			.to.be.revertedWith('Governor: proposal not successful');
	});

	it('Revert executing proposal if proposal state is not success', async () => {
		await expect(governance.execute([governance.address], [0], [calldata], descriptionHash))
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
		expect(votes.forVotes).to.equal(REMANENT_AMOUNT.add(TRANSFER_AMOUNT.mul(3)));
	});

	it('queues proposal correctly', async () => {
		await time.increase(300);
		await time.advanceBlock();

		account = await impersonate(OWNER_SWEEPR);
		expect(await governance.state(proposal_id)).to.equal(Const.PROPOSAL_SUCCEEDED);
		await governance.connect(account).queue([governance.address], [0], [calldata], descriptionHash);
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
		await governance.connect(account).execute([governance.address], [0], [calldata], descriptionHash);
		expect(await governance.state(proposal_id)).to.equal(Const.PROPOSAL_EXECUTED);

		await time.increase(300);
		await time.advanceBlock();

		blockNumber = await ethers.provider.getBlockNumber();
		expect(await governance.quorum(blockNumber - 1)).to.equal(totalSupply.mul(NEW_VOTES_QUORUM).div(100));
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

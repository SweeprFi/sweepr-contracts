const { ethers } = require("hardhat");
const { addresses, roles, network } = require("../utils/address");
const { toBN } = require('../utils/helper_functions');

async function main() {
  let deployer = '';
  const timelockAddress = addresses.timelock;
  const sweeprAddress = addresses.sweepr;
  /*
  In Arbitrum, block time is around 15 seconds, we will have set 
  votingDelay = 2 days = 172800 seconds = 11520 blocks
  votingPeriod = 3 days = 259200 seconds = 17280 blocks
  */
  const votingDelay = 11520; // 2 days
  const votingPeriod = 17280; // 3 week

  const proposalThreshold = toBN("10000", 18) // 10000 SWEEPR
  const votesQuorum = 40 // 40%

  if (network.type === "0") { // local
	  [deployer] = await ethers.getSigners();
	  deployer = deployer.address;
  } else {
	  deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const governanceInstance = await ethers.getContractFactory("SweeprGovernor");
  const governanceContract = await governanceInstance.deploy(sweeprAddress, timelockAddress, votingDelay, votingPeriod, proposalThreshold, votesQuorum);

  console.log("Governance deployed to:", governanceContract.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${governanceContract.address} ${sweeprAddress} ${timelockAddress} ${votingDelay} ${votingPeriod} ${proposalThreshold} ${votesQuorum}`);

  // Grant governor as proposer and executor
  PROPOSER_ROLE = roles.PROPOSER_ROLE;
  EXECUTOR_ROLE = roles.EXECUTOR_ROLE;
  CANCELLER_ROLE = roles.CANCELLER_ROLE;

  const timelock = await ethers.getContractAt("TimelockController", timelockAddress);

  await timelock.grantRole(PROPOSER_ROLE, governanceContract.address);
  await timelock.grantRole(EXECUTOR_ROLE, governanceContract.address);
  await timelock.grantRole(CANCELLER_ROLE, deployer);
}

main();

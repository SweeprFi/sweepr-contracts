const { ethers } = require("hardhat");
const { addresses, roles, network } = require("../utils/address");

async function main() {
  let deployer = '';
  const timelockAddress = addresses.timelock;
  const sweeprAddress = addresses.sweepr;
  const delay = 50400; // 1 week

  if (network.type === "0") { // local
	  [deployer] = await ethers.getSigners();
	  deployer = deployer.address;
  } else {
	  deployer = addresses.owner;
  }

  console.log(`Deploying contracts on ${network.name} with the account: ${deployer}`);

  const governanceInstance = await ethers.getContractFactory("SweepGovernor");
  const governanceContract = await governanceInstance.deploy(sweeprAddress, timelockAddress, delay);

  console.log("Governance deployed to:", governanceContract.address);
  console.log(`\nnpx hardhat verify --network ${network.name} ${governanceContract.address} ${sweeprAddress} ${timelockAddress} ${delay}`);

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

const { ethers } = require("hardhat");
const { addresses } = require('../../utils/address');

async function main() {
  // Actors
  [owner, borrower] = await ethers.getSigners();

  const DEPLOYER = owner.address;
  const BORROWER = borrower.address;
  const WALLET = addresses.wallet;
  const TREASURY = addresses.treasury;
  const USDX = addresses.usdc;
  const SWEEP_ADDRESS = addresses.sweep;
  const BALANCER_ADDRESS = addresses.balancer;
  const UNISWAP_AMM_ADDRESS = addresses.uniswap_amm;

  const MAX_BORROW = ethers.utils.parseUnits("500", 18);
  const MINIMUM_EQUITY_RATIO = ethers.utils.parseUnits("10", 4); // 1%
  const SPREAD_FEE = ethers.utils.parseUnits("10", 4); // 1%
  const LINK = "https://test.com"; // Off-Chain link

  console.log("------ Beginning ------");
  console.log("\nDeployer:", DEPLOYER);

  const StabilizerOff = await ethers.getContractFactory("Stabilizer");
  const stabilizerOff = await StabilizerOff.deploy(
    DEPLOYER,
    SWEEP_ADDRESS,
    USDX,
    MINIMUM_EQUITY_RATIO,
    SPREAD_FEE,
    TREASURY,
    BALANCER_ADDRESS
  );

  const OffChainAsset = await ethers.getContractFactory("OffChainAsset");
  const offChainAsset = await OffChainAsset.deploy(BORROWER, WALLET, stabilizerOff.address, LINK, SWEEP_ADDRESS, USDX);

  const StabilizerOn = await ethers.getContractFactory("Stabilizer");
  const stabilizerOn = await StabilizerOn.deploy(
    DEPLOYER,
    SWEEP_ADDRESS,
    USDX,
    MINIMUM_EQUITY_RATIO,
    SPREAD_FEE,
    TREASURY,
    BALANCER_ADDRESS
  );

  const AaveAMOFactory = await ethers.getContractFactory("AaveAMO");
	const aaveAMO = await AaveAMOFactory.deploy(
		DEPLOYER,
		stabilizerOn.address,
		'0x4bd5643ac6f66a5237E18bfA7d47cF22f1c9F210',
		USDX,
		SWEEP_ADDRESS,
		'0x935c0F6019b05C787573B5e6176681282A3f3E05',
		UNISWAP_AMM_ADDRESS
	);

  console.log(`\nOFF CHAIN`);
  console.log(`STABILIZER_ADDRESS=${stabilizerOff.address}`);
  console.log(`OFF_CHAIN_ASSET=${offChainAsset.address}`);

  console.log(`\nON CHAIN`);
  console.log(`STABILIZER_ADDRESS=${stabilizerOn.address}`);
  console.log(`ON_CHAIN_ASSET=${aaveAMO.address}`);

	// CONFIGURE
  const _sweep = await ethers.getContractFactory("SweepDollarCoin");
  const sweep = await _sweep.attach(SWEEP_ADDRESS);

  txn = await stabilizerOff.setAsset(offChainAsset.address);
  await txn.wait();
  txn = await stabilizerOff.setBorrower(BORROWER);
  await txn.wait();
  txn = await sweep.addMinter(stabilizerOff.address, MAX_BORROW);
  await txn.wait();

  txn = await stabilizerOn.setAsset(aaveAMO.address);
  await txn.wait();
  txn = await stabilizerOn.setBorrower(BORROWER);
  await txn.wait();
  txn = await sweep.addMinter(stabilizerOn.address, MAX_BORROW);
  await txn.wait();
  txn = await sweep.addMinter(aaveAMO.address, 1);
  await txn.wait();
}

main();

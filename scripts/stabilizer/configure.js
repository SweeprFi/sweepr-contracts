const { ethers } = require("hardhat");
const { addresses, network } = require("../../utils/address");

async function main() {
  let borrower = '';
  const USE_CONFIG = 1;
  
  const minEquityRatio = 1e5; // 10%
  const spreadFee = 1e4; // 1%
  const loanLimit = ethers.utils.parseUnits("1000", 18);
  const liquidatorDiscount = 2e4; // 2%
  const link = 'https://docs.sweepr.finance/';

  const config = {
	1: {
		stabilizer: addresses.stabilizer_offChain,
		asset: addresses.asset_offChain,
		callDelay: 432000, // 5 days
		liquidatable: false,
	},
	2: {
		stabilizer: addresses.stabilizer_aave,
		asset: addresses.asset_aave,
		callDelay: 0,
		liquidatable: true,
	},
	3: {
		stabilizer: addresses.stabilizer_uniswap,
		asset: addresses.asset_uniswap,
		callDelay: 0,
		liquidatable: false,
	},
	4: {
		stabilizer: addresses.stabilizer_weth,
		asset: addresses.asset_weth,
		callDelay: 0,
		liquidatable: true,
	},
	5: {
		stabilizer: addresses.stabilizer_wbtc,
		asset: addresses.asset_wbtc,
		callDelay: 0,
		liquidatable: true,
	},
  }

  if (network.type === "0") { // local
	[borrower] = await ethers.getSigners();
	borrower = borrower.address;
  } else {
	borrower = addresses.borrower;
  }

  console.log(`Configutating Stabilizer on ${network.name} with the account: ${borrower}`);

  const Stabilizer = await ethers.getContractFactory("Stabilizer");
  const stabilizer = await Stabilizer.attach(config[USE_CONFIG].stabilizer);

  await stabilizer.configure(
	config[USE_CONFIG].asset,
	minEquityRatio,
	spreadFee,
	loanLimit,
	liquidatorDiscount,
	config[USE_CONFIG].callDelay,
	config[USE_CONFIG].liquidatable,
	link
  );

  console.log("Successful configuration ...");
}

main();

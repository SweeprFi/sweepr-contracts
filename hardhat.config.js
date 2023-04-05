require("@nomiclabs/hardhat-etherscan");
require('@openzeppelin/hardhat-upgrades');
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-web3");
require("@nomiclabs/hardhat-truffle5");
require('@nomicfoundation/hardhat-chai-matchers');
require('hardhat-contract-sizer');
require('solidity-coverage');
require('dotenv').config();

module.exports = {
	solidity: {
		compilers: [
			{
				version: "0.8.16",
				settings: {
					optimizer: {
						enabled: true,
						runs: 100000
					}
				}
			}
		],
	},
	networks: {
		hardhat: {
			forking: {
				// url: "https://eth-goerli.alchemyapi.io/v2/"  + process.env.ALCHEMY_KEY, // Goerli
				// url: "https://eth-mainnet.alchemyapi.io/v2/"  + process.env.ALCHEMY_KEY, // Mainnet
				// url: "https://arb-goerli.g.alchemy.com/v2/" + process.env.ARBITRUM_KEY, // Goerli-Arbitrum
				url: "https://arb-mainnet.g.alchemy.com/v2/" + process.env.ARBITRUM_MAIN_KEY, // Arbitrum-Mainnet
				// blockNumber: 20005467
			}
		},
		localhost: {
			allowUnlimitedContractSize: true,
			blockGasLimit: 87500000000,
			url: 'http://127.0.0.1:8545/',
			// accounts: [process.env.OWNER_PKEY, process.env.BORROWER_PKEY, process.env.WALLET_PKEY],
		},
		goerli: {
			url: "https://eth-goerli.alchemyapi.io/v2/" + process.env.ALCHEMY_KEY,
			gas: 10000000,
			accounts: [process.env.OWNER_PKEY, process.env.BORROWER_PKEY]
		},
		arbitrum: {
			url: "https://arb-mainnet.g.alchemy.com/v2/" + process.env.ARBITRUM_MAIN_KEY,
			gas: 10000000,
			chainId: 42161,
			accounts: [process.env.OWNER_PKEY, process.env.BORROWER_PKEY]
		},
		main: {
			url: "https://eth-mainnet.g.alchemy.com/v2/" + process.env.ALCHEMY_KEY,
			gas: 10000000,
			accounts: [process.env.OWNER_PKEY],
		},
	},
	etherscan: {
		// apiKey: process.env.ETHERSCAN_API_KEY, // Goerli
		apiKey: process.env.ARBISCAN_API_KEY, // Arbitrum
	},
	gasReporter: {
		enabled: (process.env.REPORT_GAS) ? true : false,
		currency: 'USD'
	},
	mocha: {
    timeout: 100000000
  }
};

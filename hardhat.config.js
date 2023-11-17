require("@nomiclabs/hardhat-etherscan");
require('@openzeppelin/hardhat-upgrades');
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-web3");
require("@nomiclabs/hardhat-truffle5");
require('@nomicfoundation/hardhat-chai-matchers');
require('hardhat-contract-sizer');
require("hardhat-tracer");
require('solidity-coverage');
require('dotenv').config();
require('./tasks');
const { rpcLink, apiKey } = require("./utils/address");
const { rpcLinks } = require("./utils/constantsOld");

const accounts = [process.env.OWNER_PKEY, process.env.BORROWER_PKEY, process.env.EXECUTOR_PKEY];

module.exports = {
	solidity: {
		compilers: [
			{
				version: "0.8.19",
				settings: {
					optimizer: {
						enabled: true,
						runs: 200
					}
				}
			},
		],
	},
	networks: {
		hardhat: {
			forking: {
				url: rpcLink,
				// blockNumber: 20005467
			}
		},
		localhost: {
			allowUnlimitedContractSize: true,
			blockGasLimit: 87500000000,
			url: 'http://127.0.0.1:8545/',
		},
		mainnet: {
			url: rpcLinks[1],
			gas: 10000000,
			chainId: 1,
			accounts: accounts
		},
		goerli: {
			url: rpcLinks[5],
			gas: 10000000,
			chainId: 5,
			accounts: accounts
		},
		arbitrum: {
			url: rpcLinks[42161],
			gas: 10000000,
			chainId: 42161,
			accounts: accounts
		},
		arbitrum_goerli: {
			url: rpcLinks[421613],
			gas: 10000000,
			chainId: 421613,
			accounts: accounts
		},
		optimism: {
			url: rpcLinks[10],
			gas: 10000000,
			chainId: 10,
			accounts: accounts
		},
		optimism_goerli: {
			url: rpcLinks[420],
			gas: 10000000,
			chainId: 420,
			accounts: accounts
		},
		base: {
			url: rpcLinks[8453],
			gas: 10000000,
			chainId: 8453,
			accounts: accounts
		},
		base_goerli: {
			url: rpcLinks[84531],
			gas: 10000000,
			chainId: 84531,
			accounts: accounts
		},
	},
	etherscan: {
		// apiKey: apiKey,
		apiKey: {
			arbitrumOne: apiKey,
			base_goerli: apiKey,
			base: apiKey
		},
		customChains: [
			{
				network: "base_goerli",
				chainId: 84531,
				urls: {
					apiURL: "https://api-goerli.basescan.org/api",
					browserURL: "https://goerli.basescan.org"
				}
			},
			{
				network: "base",
				chainId: 8453,
				urls: {
					apiURL: "https://api.basescan.org/api",
					browserURL: "https://basescan.org"
				}
			}
		]
	},
	gasReporter: {
		enabled: false,
		currency: 'USD'
	},
	mocha: {
		timeout: 100000000
	}
};

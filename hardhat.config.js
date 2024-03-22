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

const { alchemyLink, network, scanApiKey } = require("./utils/constants");

const accounts = [process.env.OWNER_PKEY, process.env.BORROWER_PKEY, process.env.EXECUTOR_PKEY];

const networks = {
	hardhat: {
		forking: {
			url: alchemyLink,
			// blockNumber: 20005467
		},
	},
	localhost: {
		allowUnlimitedContractSize: true,
		blockGasLimit: 87500000000,
		url: 'http://127.0.0.1:8545/',
		accounts: accounts
	}
}

networks[network.name] = {
	url: alchemyLink,
	gas: 10000000,
	chainId: network.id,
	accounts: accounts
}

module.exports = {
	networks: networks,

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

	etherscan: {
		apiKey: {
			arbitrumOne: scanApiKey,
			base: scanApiKey,
			optimisticEthereum: scanApiKey,
			mainnet: scanApiKey,
			avalanche: scanApiKey,
			polygon: scanApiKey,
			bsc: scanApiKey,
		},
		customChains: [
			{
				network: "base",
				chainId: 8453,
				urls: {
					apiURL: "https://api.basescan.org/api",
					browserURL: "https://basescan.org"
				}
			},
			{
				network: "avalanche",
				chainId: 43114,
				urls: {
				  apiURL: "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan",
				  browserURL: "https://avalanche.routescan.io"
				}
			},
			{
				network: "gnosis",
				chainId: 100,
				urls: {
					apiURL: "https://api.gnosisscan.io/api",
					browserURL: "https://gnosisscan.io"
				}
			},
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

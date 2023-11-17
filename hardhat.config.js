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
		apiKey: scanApiKey,
	},

	gasReporter: {
		enabled: false,
		currency: 'USD'
	},

	mocha: {
		timeout: 100000000
	}
};

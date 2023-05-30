module.exports = {
  skipFiles: ["Common/", "Utils/", "Mocks/", "Oracle/ChainlinkPricer.sol", "Governance/omnichain/"],
  istanbulReporter: ['text', 'html'],
  measureFunctionCoverage: false,
  configureYulOptimizer: true
};

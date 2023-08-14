module.exports = {
  skipFiles: ["Common/", "Utils/", "Mocks/", "Governance/omnichain/"],
  istanbulReporter: ['text', 'html'],
  measureFunctionCoverage: false,
  configureYulOptimizer: true
};

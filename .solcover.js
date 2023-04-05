module.exports = {
  skipFiles: [
    "Utils/Address.sol",
    "Utils/EnumerableSet.sol",
    "Utils/Math/PRBMath.sol",
    "Utils/Math/PRBMathSD59x18.sol",
    "Utils/Math/SafeMath.sol",
    "Utils/Uniswap/V2/TransferHelper.sol",
    "Utils/Uniswap/V3/libraries/FullMath.sol",
    "Utils/Uniswap/V3/libraries/OracleLibrary.sol",
    "Utils/Uniswap/V3/libraries/TickMath.sol"
  ],
  istanbulReporter: ['text', 'html'],
  measureFunctionCoverage: false,
  configureYulOptimizer: true
};

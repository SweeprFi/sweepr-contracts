/// run:
/// node scripts/sweep/sqrt_price_x96.js

const price = 1;

/// token0 is USDC
/// token1 is SWEEP
/// in this case address(USDC) < address(SWEEP)
/// selecting the correct token0 and token1 is important
/// because the result changes depending on them
const token0Decimals = 6;
const token1Decimals = 18;

const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);

const mathPrice = price / decimalAdjustment;

let sqrtPriceX96 = Math.floor(Math.sqrt(mathPrice) * 2 ** 96);

const result = BigInt(sqrtPriceX96);

console.log(result);

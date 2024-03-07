// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "./WeightedMath.sol";
import "./WeightedPoolUserData.sol";

library WeightedPoolLib {
    using WeightedPoolUserData for bytes;

    function exitExactBPTInForTokenOut(
        uint256[] memory balances,
        uint256[] memory normalizedWeights,
        uint256 totalSupply,
        uint256 swapFeePercentage,
        bytes memory userData
    ) external pure returns (uint256, uint256[] memory) {
        (uint256 bptAmountIn, uint256 tokenIndex) = userData.exactBptInForTokenOut();
        require(tokenIndex < balances.length, "Errors.OUT_OF_BOUNDS");

        uint256 amountOut = WeightedMath._calcTokenOutGivenExactBptIn(
            balances[tokenIndex],
            normalizedWeights[tokenIndex],
            bptAmountIn,
            totalSupply,
            swapFeePercentage
        );

        uint256[] memory amountsOut = new uint256[](balances.length);
        amountsOut[tokenIndex] = amountOut;
        return (bptAmountIn, amountsOut);
    }
}
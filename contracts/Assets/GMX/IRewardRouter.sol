// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

interface IRewardRouter {
    function glpManager() external view returns (address);

    function stakedGlpTracker() external view returns (address);

    function feeGlpTracker() external view returns (address);

    function mintAndStakeGlp(
        address token,
        uint256 amount,
        uint256 minUsdg,
        uint256 minGlp
    ) external returns (uint256);

    function unstakeAndRedeemGlp(
        address tokenOut,
        uint256 glpAmount,
        uint256 minOut,
        address receiver
    ) external returns (uint256);
}

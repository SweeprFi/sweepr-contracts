// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts/interfaces/IERC4626.sol";

interface ISUSDe is IERC4626 {
    function cooldowns(address assets) external view returns(uint104 cooldownEnd, uint152 underlyingAmount);

    function cooldownDuration() external view returns(uint24);

    // ****************************** //
    function cooldownAssets(uint256 assets) external returns (uint256 shares);

    function cooldownShares(uint256 shares) external returns (uint256 assets);

    function unstake(address receiver) external;

    function setCooldownDuration(uint24 duration) external;
}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IGToken {
    function asset() external view returns (address);

    function openTradesPnlFeed() external view returns (address);

    function currentEpoch() external returns (uint256);

    function withdrawEpochsTimelock() external view returns (uint256);

    function decimals() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function previewRedeem(uint256 amount) external view returns (uint256);

    function currentEpochStart() external view returns (uint256);

    function convertToShares(uint256 assets) external view returns (uint256);

    function withdrawRequests(
        address account,
        uint256 epcho
    ) external view returns (uint256);

    function makeWithdrawRequest(uint256 shares, address account) external;

    function deposit(
        uint256 assets,
        address receiver
    ) external returns (uint256);

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external returns (uint256);
}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

interface IGmxJuniorVault {
    function asset() external view returns (address);

    function decimals() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function convertToAssets(uint256 shares) external view returns (uint256);
    
    function getPrice(bool maximise) external view returns (uint256);
}

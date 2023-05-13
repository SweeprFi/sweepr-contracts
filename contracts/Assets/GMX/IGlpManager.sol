// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IGlpManager {
    function PRICE_PRECISION() external view returns (uint256);

    function vault() external view returns (address);

    function getPrice(bool maximise) external view returns (uint256);
}

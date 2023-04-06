// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.16;

interface IGlpManager {
    function vault() external view returns (address);

    function getPrice(bool maximise) external view returns (uint256);
}

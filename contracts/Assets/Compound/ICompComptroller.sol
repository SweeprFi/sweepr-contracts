// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

interface ICompComptroller {
  // Views
  // ==============================
  function compAccrued(address addr) external view returns (uint256);
  function compSpeeds(address ctoken_addr) external view returns (uint256);

  // Mutative
  // ==============================
  function claimComp(address holder) external;
  function claimComp(address holder, address[] memory cTokens) external;
}

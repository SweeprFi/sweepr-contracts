//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.11;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol";

contract USDCMock is ERC20PresetFixedSupply {
  uint256 public constant GENESIS_SUPPLY = 2000000e18;

  constructor()
  ERC20PresetFixedSupply("USDC Mock", "USDC", GENESIS_SUPPLY, msg.sender) {
  }

  function decimals() public pure override returns (uint8) {
    return 6;
  }
}

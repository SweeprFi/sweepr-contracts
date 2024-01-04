//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.11;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol";

contract USDCMock is ERC20PresetFixedSupply {
  uint256 public constant GENESIS_SUPPLY = 2000000e18;
  uint8 _decimals;

  constructor(uint8 dec)
  ERC20PresetFixedSupply("USDC Mock", "USDC", GENESIS_SUPPLY, msg.sender) {
    _decimals = dec;
  }

  function decimals() public view override returns (uint8) {
    return _decimals;
  }
}

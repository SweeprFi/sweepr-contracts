//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.11;
import "../Common/ERC20/ERC20Virtual.sol";

contract USDCMock is ERC20Virtual {
  uint256 public constant GENESIS_SUPPLY = 2000000e18;

  constructor()
  ERC20Virtual("USDC Mock", "USDC") {
    _mint(msg.sender, GENESIS_SUPPLY);
  }

  function decimals() public pure override returns (uint8) {
    return 6;
  }
}

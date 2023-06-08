// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts/interfaces/IERC20.sol";

interface IcUSDC is IERC20 {
    function decimals() external view returns (uint256);

    /**
     * @notice Supplies an `amount` of underlying asset into the reserve, receiving in return overlying cTokens.
     * - E.g. User supplies 100 USDC and gets in return 100 cUSDC
     * @param asset The address of the underlying asset to supply
     * @param amount The amount to be supplied
     **/
    function supply(
        address asset,
        uint256 amount
    ) external;

    /**
     * @notice Withdraws an `amount` of underlying asset from the reserve, burning the equivalent cTokens owned
     * E.g. User has 100 aUSDC, calls withdraw() and receives 100 USDC, burning the 100 cUSDC
     * @param asset The address of the underlying asset to withdraw
     * @param amount The underlying amount to be withdrawn
     *   - Send the value type(uint256).max in order to withdraw the whole cToken balance
     **/
    function withdraw(
        address asset,
        uint256 amount
    ) external;
}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

interface IWithdrawPeriphery {
    /**
     * @notice allows to redeem junior vault shares to any token available on gmx
     * @param token output token
     * @param receiver address of the receiver
     * @param sharesAmount amount of shares to burn
     * @return amountOut tokens received in exchange of glp
     */
    function redeemToken(
        address token,
        address receiver,
        uint256 sharesAmount
    ) external returns (uint256);
}
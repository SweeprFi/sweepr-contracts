// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;

interface IDepositPeriphery {
    /**
     * @notice allows to use tokens to deposit into junior vault
     * @param token input token
     * @param receiver address of the receiver
     * @param tokenAmount amount of token to deposit
     * @return sharesReceived shares received in exchange of token
     */
    function depositToken(
        address token,
        address receiver,
        uint256 tokenAmount
    ) external returns (uint256);
}

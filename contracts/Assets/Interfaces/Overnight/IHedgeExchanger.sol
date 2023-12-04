// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IHedgeExchanger {
    function buyFee() external view returns (uint256);

    function buyFeeDenominator() external view returns (uint256);

    function redeemFee() external view returns (uint256);

    function redeemFeeDenominator() external view returns (uint256);

    function buy(
        uint256 amount,
        string calldata referral
    ) external returns (uint256);

    function redeem(uint256 amount) external returns (uint256);
}

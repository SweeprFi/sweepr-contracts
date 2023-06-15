// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IExchanger {
    struct MintParams {
        address asset; // USDC | BUSD depends at chain
        uint256 amount; // amount asset
        string referral; // code from Referral Program -> if not have -> set empty
    }

    function redeemFee() external view returns (uint256);

    function redeemFeeDenominator() external view returns (uint256);

    // Minting USD+ in exchange for an asset
    function mint(MintParams calldata params) external returns (uint256);

    /**
     * @param asset Asset to redeem
     * @param amount Amount of USD+ to burn
     * @return Amount of asset unstacked and transferred to caller
     */
    function redeem(address asset, uint256 amount) external returns (uint256);
}

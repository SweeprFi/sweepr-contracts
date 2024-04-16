// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// import "@openzeppelin/contracts/interfaces/IERC4626.sol";

interface IApolloX { // } is IERC4626 {

    function coolingDuration() external view returns (uint256);

    function mintAlp(address tokenIn, uint256 amountIn, uint256 minAlp, bool stake) external;
    function burnAlp(address tokenOut, uint256 alpAmount, uint256 minOut, address receiver) external;

    function unStake(uint256 _amount) external;
    function claimAllReward() external;

    function alpPrice() external view returns (uint256);
    function stakeOf(address _user) external view returns (uint256);

    function pendingApx(address _account) external view returns (uint256);
}

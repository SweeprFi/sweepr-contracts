// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;
pragma experimental ABIEncoderV2;

interface IAMM {
    function swapExactInput(
        address _tokenA,
        address _tokenB,
        uint256 _amountIn,
        uint256 _amountOutMin
    ) external returns (uint256);

    function buySweep(address _token, uint256 _amountIn, uint256 _amountOutMin)
        external
        returns (uint256);

    function sellSweep(address _token, uint256 _amountIn, uint256 _amountOutMin)
        external
        returns (uint256);

    function poolFee() external view returns (uint24);

    function usdOracle() external view returns(address);
    
    function sequencerUptimeFeed() external view returns(address);
}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

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

    function sequencer() external view returns(address);

    function poolFee() external view returns(uint24);

    function getTWAPrice() external view returns (uint256 amountOut);

    function getPrice() external view returns (uint256 amountOut);

    function tokenToUSD(uint256 tokenAmount) external view returns (uint256 usdAmount);

    function USDtoToken(uint256 usdAmount) external view returns (uint256 tokenAmount);

}

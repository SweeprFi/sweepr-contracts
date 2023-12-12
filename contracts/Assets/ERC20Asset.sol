// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== ERC20Asset.sol ==========================
// ====================================================================

/**
 * @title Token Asset
 * @dev Representation of an on-chain investment like Wrapped Ether, Wrapped Bitcoin ...
 */

import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { Stabilizer, IPriceFeed, IAMM, ChainlinkLibrary, OvnMath, TransferHelper, IERC20Metadata } from "../Stabilizer/Stabilizer.sol";
import { ISwapRouter } from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import { IUniswapV3Pool } from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract ERC20Asset is Stabilizer {
    uint16 private constant DEADLINE_GAP = 15 minutes;
    ISwapRouter private constant ROUTER = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    // Variables
    IERC20Metadata private immutable token;
    IPriceFeed private immutable oracleToken;
    IUniswapV3Pool private immutable pool;

    // Events
    event Invested(uint256 indexed tokenAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _token,
        address _oracleUsdx,
        address _oracleToken,
        address _borrower,
        address _pool

    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        token = IERC20Metadata(_token);
        oracleToken = IPriceFeed(_oracleToken);
        pool = IUniswapV3Pool(_pool);
    }

    /* ========== Views ========== */

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     * @dev the price is obtained from Chainlink
     */
    function assetValue() public view override returns (uint256) {
        uint256 tokenBalance = token.balanceOf(address(this));
        // All numbers given are in USDX unless otherwise stated
        return _oracleTokenToUsd(tokenBalance);
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest.
     * @param usdxAmount Amount of usdx to be swapped for token.
     * @param slippage .
     * @dev Swap from usdx to token.
     */
    function invest(
        uint256 usdxAmount,
        uint256 slippage
    ) external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount) {
        _invest(usdxAmount, 0, slippage);
    }

    /**
     * @notice Divest.
     * @param usdxAmount Amount to be divested.
     * @param slippage .
     * @dev Swap from the token to usdx.
     */
    function divest(
        uint256 usdxAmount,
        uint256 slippage
    )
        external
        onlyBorrower
        nonReentrant
        validAmount(usdxAmount)
        returns (uint256)
    {
        return _divest(usdxAmount, slippage);
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external nonReentrant {
        if(auctionAllowed) revert ActionNotAllowed();
        _liquidate(address(token), getDebt());
    }

    /* ========== Internals ========== */

    function _getToken() internal view override returns (address) {
        return address(token);
    }

    function _invest(
        uint256 usdxAmount,
        uint256,
        uint256 slippage
    ) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        uint256 usdxInToken = _oracleUsdxToToken(usdxAmount);
        uint256 tokenAmount = swap(
            address(usdx),
            address(token),
            usdxAmount,
            OvnMath.subBasisPoints(usdxInToken, slippage)
        );

        emit Invested(tokenAmount);
    }

    function _divest(
        uint256 usdxAmount,
        uint256 slippage
    ) internal override returns (uint256 divestedAmount) {
        uint256 tokenAmount = _oracleUsdxToToken(usdxAmount);
        uint256 tokenBalance = token.balanceOf(address(this));
        if (tokenBalance == 0) revert NotEnoughBalance();
        if (tokenBalance < tokenAmount) tokenAmount = tokenBalance;

        uint256 tokenInUsdx = _oracleTokenToUsdx(tokenAmount);
        divestedAmount = swap(
            address(token),
            address(usdx),
            tokenAmount,
            OvnMath.subBasisPoints(tokenInUsdx, slippage)
        );

        emit Divested(divestedAmount);
    }

    /**
     * @notice Swap tokenA into tokenB using uniV3Router.ExactInputSingle()
     * @param tokenA Address to in
     * @param tokenB Address to out
     * @param amountIn Amount of _tokenA
     * @param amountOutMin Minimum amount out.
     */
    function swap(
        address tokenA,
        address tokenB,
        uint256 amountIn,
        uint256 amountOutMin
    ) internal returns (uint256 amountOut) {
        // Approval
        TransferHelper.safeApprove(tokenA, address(ROUTER), amountIn);

        ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenA,
                tokenOut: tokenB,
                fee: pool.fee(),
                recipient: address(this),
                deadline: block.timestamp + DEADLINE_GAP,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            });

        amountOut = ROUTER.exactInputSingle(swapParams);
    }

    function _oracleTokenToUsd(
        uint256 tokenAmount
    ) internal view returns (uint256) {
        return
            ChainlinkLibrary.convertTokenToUsd(
                tokenAmount,
                token.decimals(),
                oracleToken
            );
    }

    function _oracleTokenToUsdx(
        uint256 tokenAmount
    ) internal view returns (uint256) {
        return
            ChainlinkLibrary.convertTokenToToken(
                tokenAmount,
                token.decimals(),
                usdx.decimals(),
                oracleToken,
                oracleUsdx
            );
    }

    function _oracleUsdxToToken(
        uint256 usdxAmount
    ) internal view returns (uint256) {
        return
            ChainlinkLibrary.convertTokenToToken(
                usdxAmount,
                usdx.decimals(),
                token.decimals(),
                oracleUsdx,
                oracleToken
            );
    }
}

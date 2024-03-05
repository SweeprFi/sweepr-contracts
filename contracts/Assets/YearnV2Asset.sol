// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== YearnV2Asset.sol ========================
// ====================================================================

/**
 * @title YearnV2 Asset
 * @dev Representation of an on-chain investment
 */
import { Stabilizer, IERC20Metadata, IAMM, TransferHelper, OvnMath } from "../Stabilizer/Stabilizer.sol";
import { IUniswapV3Pool } from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import { ISwapRouter } from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import { IYearnVault, IYearnStaking } from "./Interfaces/Yearn/IYearnVault.sol";

contract YearnV2Asset is Stabilizer {
    // Variables
    IYearnVault public immutable asset;
    IYearnStaking public immutable stake;
    IERC20Metadata private immutable dai;
    ISwapRouter private immutable router;

    // Events
    event Invested(uint256 indexed tokenAmount);
    event Divested(uint256 indexed usdxAmount);

    error UnexpectedAmount();
    uint16 private constant DEADLINE_GAP = 15 minutes;

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _dai,
        address _asset,
        address _stake,
        address _oracleUsdx,
        address _borrower,
        address _router
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        asset = IYearnVault(_asset);
        dai = IERC20Metadata(_dai);
        router = ISwapRouter(_router);
        stake = IYearnStaking(_stake);
    }

    /* ========== Views ========== */

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     * @dev the price is obtained from the target asset
     */
    function assetValue() public view virtual override returns (uint256) {
        uint256 sharesBalance = stake.balanceOf(address(this));
        uint256 usdxAmount = sharesBalance * asset.pricePerShare() / 1e30;

        return _oracleUsdxToUsd(usdxAmount);
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest.
     * @param usdxAmount Amount to be invested
     * @dev Sends usdx to the target asset to get shares.
     */
    function invest(uint256 usdxAmount, uint256 slippage)
        external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount)
    {
        _invest(usdxAmount, 0, slippage);
    }

    /**
     * @notice Divest.
     * @param usdxAmount Amount to be divested.
     * @dev Gets usdx back by redeeming shares.
     */
    function divest(uint256 usdxAmount, uint256 slippage)
        external onlyBorrower nonReentrant validAmount(usdxAmount)
    {
        _divest(usdxAmount, slippage);
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external nonReentrant {
        if(auctionAllowed) revert ActionNotAllowed();
        _liquidate(_getToken(), getDebt());
    }

    function collect() external onlyBorrower nonReentrant {
        stake.getReward();
    }

    function _getToken() internal view override returns (address) {
        return address(asset);
    }

    /* ========== Internals ========== */

    function _invest(uint256 usdxAmount, uint256, uint256 slippage) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        uint256 amountOutMin = OvnMath.subBasisPoints(usdxAmount, slippage);
        uint256 daiAmount = swap(address(usdx), address(dai), usdxAmount, amountOutMin);

        // deposit into yearn vault
        TransferHelper.safeApprove(address(dai), address(asset), daiAmount);
        asset.deposit(daiAmount);

        // stake the shares
        uint256 sharesAmount = asset.balanceOf(address(this));
        TransferHelper.safeApprove(address(asset), address(stake), sharesAmount);
        stake.stake(sharesAmount);

        emit Invested(usdxAmount);
    }

    function _divest(uint256 usdxAmount, uint256 slippage) internal override {
        uint256 sharesBalance = stake.balanceOf(address(this));
        if (sharesBalance == 0) revert NotEnoughBalance();
        uint256 sharesAmount =  1e30 * usdxAmount / asset.pricePerShare();
        if (sharesBalance < sharesAmount) sharesAmount = sharesBalance;

        stake.withdraw(sharesAmount);
        asset.withdraw(sharesAmount);

        uint256 daiAmount = dai.balanceOf(address(this));
        uint256 amountOutMin = OvnMath.subBasisPoints(daiAmount/1e12, slippage);
        uint256 usdcAmount = swap(address(dai), address(usdx), daiAmount, amountOutMin);

        emit Divested(usdcAmount);
    }

    /**
     * @notice Swap tokenA into tokenB using uniV3Router.ExactInputSingle()
     * @param tokenA Address to in
     * @param tokenB Address to out
     * @param amountIn Amount of _tokenA
     * @param amountOutMin Minimum amount out.
     */
    function swap(address tokenA, address tokenB, uint256 amountIn, uint256 amountOutMin) 
        private returns (uint256 amountOut)
    {
        TransferHelper.safeApprove(tokenA, address(router), amountIn);

        ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenA,
                tokenOut: tokenB,
                fee: 100,
                recipient: address(this),
                deadline: block.timestamp + DEADLINE_GAP,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            });

        amountOut = router.exactInputSingle(swapParams);
    }

}

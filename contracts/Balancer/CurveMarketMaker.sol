// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ======================== CurveMarketMaker.sol ===================
// ====================================================================

/**
 * @title Curve Stable/Stable Pool Market Maker
 * @dev Implementation:
 * Increases and decreases the liquidity
 */

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Stabilizer, TransferHelper, ISweep } from "../Stabilizer/Stabilizer.sol";
import { ICurvePool } from "../Assets/Interfaces/Curve/ICurve.sol";

contract CurveMarketMaker is Stabilizer {

    error BadAddress();
    error BadSlippage();
    error BadAmountReceived();

    event LiquidityAdded(uint256 usdxAmount, uint256 sweepAmount);
    event PoolInitialized(uint256 usdxAmount, uint256 sweepAmount);
    event LiquidityRemoved(uint256 usdxAmount, uint256 sweepAmount);
    event SweepPurchased(uint256 sweeAmount);

    ICurvePool public pool;
    // IBalancerVault public vault;
    uint32 public slippage;
    uint24 private constant PRECISION = 1e6;
    uint8 public constant USDX_IDX = 0;
    uint8 public constant SWEEP_IDX = 1;

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _oracleUsdx,
        address _poolAddress,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        slippage = 5000; // 0.5%
        pool = ICurvePool(_poolAddress);
    }

    /* ========== Views ========== */

    /**
     * @notice Gets the asset price of AMM
     * @return the amm usdx amount
     */
    function assetValue() public view override returns (uint256) {    
        uint256 lpTokens = pool.balanceOf(address(this));
        uint256 rate = pool.get_virtual_price();
        uint256 usdxFactor = 10 ** usdx.decimals();
        uint256 poolFactor = 10 ** pool.decimals();
        uint256 rateFactor = 1e18;

        uint256 usdxAmount = lpTokens * rate * usdxFactor / (poolFactor * rateFactor);
        return _oracleUsdxToUsd(usdxAmount);
    }

    function getBuyPrice() public view returns (uint256) {
        uint256 targetPrice = sweep.targetPrice();
        return targetPrice + ((sweep.arbSpread() * targetPrice) / PRECISION);
    }

    /* ========== Actions ========== */

    function initPool(uint256 usdxAmount, uint256 sweepAmount) external nonReentrant onlyBorrower {
        if(sweep.isMintingAllowed()){
            if(sweepAmount > 0) _borrow(sweepAmount);
        }

        _addLiquidity(usdxAmount, sweepAmount);
        emit PoolInitialized(usdxAmount, sweepAmount);
    }

    function buySweep(uint256 usdxAmount) external nonReentrant returns (uint256 sweepAmount) {
        sweepAmount = (_oracleUsdxToUsd(usdxAmount) * (10 ** sweep.decimals())) / getBuyPrice();

        TransferHelper.safeTransferFrom(address(usdx), msg.sender, address(this), usdxAmount);
        _borrow(sweepAmount * 2);
        _addLiquidity(usdxAmount, sweepAmount);
        TransferHelper.safeTransfer(address(sweep), msg.sender, sweepAmount);

        _checkRatio();
        emit SweepPurchased(usdxAmount);
    }

    function _addLiquidity(uint256 usdxAmount, uint256 sweepAmount) internal {
        TransferHelper.safeApprove(address(usdx), address(pool), usdxAmount);
        TransferHelper.safeApprove(address(sweep), address(pool), sweepAmount);

        uint256[] memory amounts = new uint256[](2);
        amounts[USDX_IDX] = usdxAmount;
        amounts[SWEEP_IDX] = sweepAmount;    

        uint256[] memory rates = pool.stored_rates();
        uint256 usdxMin = usdxAmount * rates[USDX_IDX] / 1e18;
        uint256 sweepMin = sweepAmount * rates[SWEEP_IDX] / 1e18;
        uint256 minMintAmount = (usdxMin + sweepMin) * (PRECISION - slippage) / PRECISION;

        uint256 balanceBefore = pool.balanceOf(address(this));
        uint256 lpTokens = pool.add_liquidity(amounts, minMintAmount);
        uint256 balanceAfter = pool.balanceOf(address(this));

        if(balanceAfter < balanceBefore + lpTokens) revert BadAmountReceived();
    }

    function addLiquidity(uint256 usdxAmount, uint256 sweepAmount) public nonReentrant onlyBorrower {
        if(sweep.isMintingAllowed()){
            if(sweepAmount > 0) _borrow(sweepAmount);
        }

        _addLiquidity(usdxAmount, sweepAmount);
        emit LiquidityAdded(usdxAmount, sweepAmount);
    }

    function removeLiquidity(uint256 burnAmont, uint256[] memory minAmounts) external nonReentrant onlyBorrower {    
        uint256 usdxBalanceBefore = usdx.balanceOf(address(this));
        uint256 sweepBalanceBefore = sweep.balanceOf(address(this));
        uint256[] memory receivedAmounts = pool.remove_liquidity(burnAmont, minAmounts);
        uint256 usdxBalanceAfter = usdx.balanceOf(address(this));
        uint256 sweepBalanceAfter = sweep.balanceOf(address(this));

        if(usdxBalanceAfter < usdxBalanceBefore + receivedAmounts[USDX_IDX]) revert BadAmountReceived();
        if(sweepBalanceAfter < sweepBalanceBefore + receivedAmounts[SWEEP_IDX]) revert BadAmountReceived();

        emit LiquidityRemoved(receivedAmounts[USDX_IDX], receivedAmounts[SWEEP_IDX]);
    }

    function removeSingleSidedLiquidity(uint256 burnAmont, int128 index, uint256 minAmountOut) external nonReentrant onlyBorrower {
        pool.remove_liquidity_one_coin(burnAmont, index, minAmountOut);
    }

    function removeLiquidityImbalance(uint256[] memory amounts, uint256 maxBurnAmount) external nonReentrant onlyBorrower {
        pool.remove_liquidity_imbalance(amounts, maxBurnAmount);
    }

    function setSlippage(uint32 newSlippage) external nonReentrant onlyBorrower {
        if(newSlippage > PRECISION) revert BadSlippage();
        slippage = newSlippage;
    }
}

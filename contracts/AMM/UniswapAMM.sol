// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.16;
pragma experimental ABIEncoderV2;

// ==========================================================
// ====================== UniswapAMM ========================
// ==========================================================

/**
 * @title Uniswap AMM
 * @dev Swaps token using Uniswap router V3
 */

import "../Common/Owned.sol";
import "../Utils/Uniswap/V3/ISwapRouter.sol";
import "../Utils/Uniswap/V3/libraries/TransferHelper.sol";

contract UniswapAMM is Owned {
    // Uniswap v3
    ISwapRouter public constant uniV3Router =
        ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    uint24 public poolFee;
    address public immutable usdOracle;
    address public immutable sequencerUptimeFeed;

    constructor(
        address _sweep_address,
        uint24 _pool_fee,
        address _usd_oracle_address,
        address _sequencer_address
    )
        Owned(_sweep_address)
    {
        poolFee = _pool_fee; // Fees are 500(0.05%), 3000(0.3%), 10000(1%)
        usdOracle = _usd_oracle_address;
        sequencerUptimeFeed = _sequencer_address;
    }

    event Bought(uint256 usdx_amount);
    event Sold(uint256 sweep_amount);
    event PoolFeeChanged(uint24 poolFee);

    error OverZero();

    /* ========== Actions ========== */

    /**
     * @notice Buy Sweep
     * @param _collateral_address Token Address to use for buying sweep.
     * @param _collateral_amount Token Amount.
     * @param _amountOutMin Minimum amount out.
     * @dev Increases the sweep balance and decrease collateral balance.
     */
    function buySweep(
        address _collateral_address,
        uint256 _collateral_amount,
        uint256 _amountOutMin
    ) public returns (uint256 sweep_amount) {
        sweep_amount = swapExactInput(
            _collateral_address,
            sweep_address,
            _collateral_amount,
            _amountOutMin
        );

        emit Bought(sweep_amount);
    }

    /**
     * @notice Sell Sweep
     * @param _collateral_address Token Address to return after selling sweep.
     * @param _sweep_amount Sweep Amount.
     * @param _amountOutMin Minimum amount out.
     * @dev Decreases the sweep balance and increase collateral balance
     */
    function sellSweep(
        address _collateral_address,
        uint256 _sweep_amount,
        uint256 _amountOutMin
    ) public returns (uint256 collateral_amount) {
        collateral_amount = swapExactInput(
            address(SWEEP),
            _collateral_address,
            _sweep_amount,
            _amountOutMin
        );

        emit Sold(_sweep_amount);
    }

    /**
     * @notice Swap tokenA into tokenB using uniV3Router.ExactInputSingle()
     * @param _tokenA Address to in
     * @param _tokenB Address to out
     * @param _amountIn Amount of _tokenA
     * @param _amountOutMin Minimum amount out.
     */
    function swapExactInput(
        address _tokenA,
        address _tokenB,
        uint256 _amountIn,
        uint256 _amountOutMin
    ) public returns (uint256 amountOut) {
        // Approval
        TransferHelper.safeTransferFrom(
            _tokenA,
            msg.sender,
            address(this),
            _amountIn
        );
        TransferHelper.safeApprove(_tokenA, address(uniV3Router), _amountIn);

        ISwapRouter.ExactInputSingleParams memory swap_params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: _tokenA,
                tokenOut: _tokenB,
                fee: poolFee,
                recipient: msg.sender,
                deadline: block.timestamp + 200,
                amountIn: _amountIn,
                amountOutMinimum: _amountOutMin,
                sqrtPriceLimitX96: 0
            });

        amountOut = uniV3Router.exactInputSingle(swap_params);
    }

    function setPoolFee(uint24 _pool_fee) external onlyAdmin {
        if(_pool_fee == 0) revert OverZero();

        poolFee = _pool_fee;
        emit PoolFeeChanged(poolFee);
    }
}

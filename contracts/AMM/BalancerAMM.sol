// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ==========================================================
// ====================== BalancerAMM.sol ====================
// ==========================================================

/**
 * @title Balancer AMM
 * @dev Interactions with Balancer Pool
 */

import { ChainlinkLibrary, IPriceFeed } from "../Libraries/Chainlink.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { TransferHelper } from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import { ISweep } from "../Sweep/ISweep.sol";
import { IAsset, SingleSwap, FundManagement, SwapKind, IBalancerVault, IBalancerPool } from "../Assets/Balancer/IBalancer.sol";

contract BalancerAMM {
    using Math for uint256;

    IBalancerVault private immutable vault;
    IBalancerPool private immutable pool;

    IERC20Metadata public immutable base;
    ISweep public immutable sweep;
    IPriceFeed public immutable oracleBase;
    IPriceFeed public immutable sequencer;
    uint24 public immutable poolFee;
    uint256 public immutable oracleBaseUpdateFrequency;

    uint8 private constant USD_DECIMALS = 6;
    uint16 private constant DEADLINE_GAP = 15 minutes;

    constructor(
        address _sweep,
        address _base,
        address _sequencer,
        uint24 _fee,
        address _oracleBase,
        uint256 _oracleBaseUpdateFrequency,
        address poolAddress
    ) {
        sweep = ISweep(_sweep);
        base = IERC20Metadata(_base);
        oracleBase = IPriceFeed(_oracleBase);
        sequencer = IPriceFeed(_sequencer);
        poolFee = _fee;
        oracleBaseUpdateFrequency = _oracleBaseUpdateFrequency;

        pool = IBalancerPool(poolAddress);
        vault = IBalancerVault(pool.getVault());
    }

    // Events
    event Bought(uint256 usdxAmount);
    event Sold(uint256 sweepAmount);
    event PoolFeeChanged(uint24 poolFee);

    // Errors
    error OverZero();

    /**
     * @notice Get Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getPrice() public view returns (uint256 price) {
        uint256 rate = pool.getRate();
        uint8 rateDecimals = 18;

        uint256 stablePrice = ChainlinkLibrary.getPrice(
            oracleBase,
            sequencer,
            oracleBaseUpdateFrequency
        );
        uint8 baseDecimals = ChainlinkLibrary.getDecimals(oracleBase);

        price = rate.mulDiv(stablePrice, 10 ** (baseDecimals + rateDecimals));
    }

    /**
     * @notice Get TWA Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getTWAPrice() external view returns (uint256 amountOut) {
        return getPrice();
    }

    function getRate() public view returns (uint256 rate) {
        rate = sweep.targetPrice() * 1e12;
    }

    /* ========== Actions ========== */

    /**
     * @notice Buy Sweep
     * @param tokenAddress Token Address to use for buying sweep.
     * @param tokenAmount Token Amount.
     * @param amountOutMin Minimum amount out.
     * @dev Increases the sweep balance and decrease collateral balance.
     */
    function buySweep(
        address tokenAddress,
        uint256 tokenAmount,
        uint256 amountOutMin
    ) external returns (uint256 sweepAmount) {
        emit Bought(tokenAmount);
        sweepAmount = swapExactInput(
            tokenAddress,
            address(sweep),
            0,
            tokenAmount,
            amountOutMin
        );
    }

    /**
     * @notice Sell Sweep
     * @param tokenAddress Token Address to return after selling sweep.
     * @param sweepAmount Sweep Amount.
     * @param amountOutMin Minimum amount out.
     * @dev Decreases the sweep balance and increase collateral balance
     */
    function sellSweep(
        address tokenAddress,
        uint256 sweepAmount,
        uint256 amountOutMin
    ) external returns (uint256 tokenAmount) {
        emit Sold(sweepAmount);
        tokenAmount = swapExactInput(
            address(sweep),
            tokenAddress,
            0,
            sweepAmount,
            amountOutMin
        );
    }

    /**
     * @notice Swap tokenIn for tokenOut using balancer exact input swap
     * @param tokenIn Address to in
     * @param tokenOut Address to out
     * @param amountIn Amount of _tokenA
     * @param amountOutMin Minimum amount out.
     */
    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint24,
        uint256 amountIn,
        uint256 amountOutMin
    ) public returns (uint256 amountOut) {
        // Approval
        TransferHelper.safeTransferFrom(
            tokenIn,
            msg.sender,
            address(this),
            amountIn
        );
        TransferHelper.safeApprove(tokenIn, address(vault), amountIn);

        bytes32 poolId = 0x0;
        bytes memory userData;
        SingleSwap memory singleSwap = SingleSwap(
            poolId,
            SwapKind.GIVEN_IN,
            IAsset(tokenIn),
            IAsset(tokenOut),
            amountIn,
            userData
        );
        FundManagement memory funds = FundManagement(
            msg.sender,
            false,
            payable(msg.sender),
            false
        );
        uint256 limit = amountOutMin;
        uint256 deadline = block.timestamp + DEADLINE_GAP;

        amountOut = pool.swap(singleSwap, funds, limit, deadline);
    }
}

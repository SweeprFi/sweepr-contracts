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
import { IAsset, SingleSwap, FundManagement, SwapKind, IBalancerVault, IBalancerPool } from "../Assets/Interfaces/Balancer/IBalancer.sol";
import { StableMath } from "../Libraries/Balancer/StableMath.sol";

contract BalancerAMM {
    using Math for uint256;

    IBalancerVault public vault;
    IBalancerPool public pool;

    IERC20Metadata public immutable base;
    ISweep public immutable sweep;
    IPriceFeed public immutable oracleBase;
    IPriceFeed public immutable sequencer;
    uint256 public immutable oracleBaseUpdateFrequency;

    uint8 private constant USD_DECIMALS = 6;
    uint16 private constant DEADLINE_GAP = 15 minutes;

    constructor(
        address _sweep,
        address _base,
        address _sequencer,
        address _oracleBase,
        uint256 _oracleBaseUpdateFrequency
    ) {
        sweep = ISweep(_sweep);
        base = IERC20Metadata(_base);
        oracleBase = IPriceFeed(_oracleBase);
        sequencer = IPriceFeed(_sequencer);
        oracleBaseUpdateFrequency = _oracleBaseUpdateFrequency;
    }

    // Events
    event Bought(uint256 usdxAmount);
    event Sold(uint256 sweepAmount);

    // Errors
    error OverZero();

    /**
     * @notice Get Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getPrice() public view returns (uint256 amountOut) {
        if(address(pool) == address(0)) return 2e6;

        uint8 sweepDecimals = sweep.decimals();
        uint8 baseDecimals = base.decimals();
        uint8 quoteDecimals = sweepDecimals - baseDecimals;

        uint256[] memory factors = pool.getScalingFactors();
        (uint256 amplification, , ) = pool.getAmplificationParameter();
        (IAsset[] memory tokens, uint256[] memory balances,) = vault.getPoolTokens(pool.getPoolId());

        uint8 tokenIndexIn = findAssetIndex(address(sweep), tokens);
        uint8 tokenIndexOut = findAssetIndex(address(base), tokens);

        uint256[] memory newBalances = new uint256[](2);
        newBalances[0] = balances[tokenIndexIn];
        newBalances[1] = balances[tokenIndexOut] * (10 ** quoteDecimals);

        uint256 invariant = StableMath._calculateInvariant(amplification, newBalances);
        uint256 quote = StableMath._calcOutGivenIn(amplification, newBalances, 0, 1, 1e18, invariant);
        uint8 oracleDecimals = ChainlinkLibrary.getDecimals(oracleBase);
        uint256 price = ChainlinkLibrary.getPrice(
            oracleBase,
            sequencer,
            oracleBaseUpdateFrequency
        );

        amountOut = (quote * factors[tokenIndexIn] * price) / (10 ** (oracleDecimals + sweepDecimals + quoteDecimals));
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

    function getPositions(uint256)
        public view
        returns (uint256 usdxAmount, uint256 sweepAmount, uint256 lp)
    {
        (IAsset[] memory tokens, uint256[] memory balances,) = vault.getPoolTokens(pool.getPoolId());
        uint8 usdxIndex = findAssetIndex(address(base), tokens);
        uint8 sweepIndex = findAssetIndex(address(sweep), tokens);
        uint8 lpIndex = findAssetIndex(address(pool), tokens);

        usdxAmount = balances[usdxIndex];
        sweepAmount = balances[sweepIndex];
        lp = balances[lpIndex];
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

        bytes32 poolId = pool.getPoolId();
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
            address(this),
            false,
            payable(msg.sender),
            false
        );

        uint256 deadline = block.timestamp + DEADLINE_GAP;

        amountOut = vault.swap(singleSwap, funds, amountOutMin, deadline);
    }

    function setPool(address poolAddress) external {
        require(msg.sender == sweep.owner(), "BalancerAMM: Not Governance");

        pool = IBalancerPool(poolAddress);
        vault = IBalancerVault(pool.getVault());
    }

    function findAssetIndex(address asset, IAsset[] memory assets) internal pure returns (uint8) {
        for (uint8 i = 0; i < assets.length; i++) {
            if (address(assets[i]) == asset) {
                return i;
            }
        }
        revert("BalancerAMM: Asset not found");
    }
}

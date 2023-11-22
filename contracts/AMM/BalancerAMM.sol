// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ==========================================================
// ====================== BalancerAMM.sol ===================
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
import { IAsset, SingleSwap, FundManagement, SwapKind, IBalancerVault, IBalancerPool, IBalancerQuoter } from "../Assets/Balancer/IBalancer.sol";
import { IAMM } from "./IAMM.sol";

contract BalancerAMM is IAMM {
    using Math for uint256;

    IBalancerQuoter public quoter;
    IBalancerVault public vault;
    IBalancerPool public pool;
    bytes32 public poolId;
    uint24 public poolFee;

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
        address _quoter,
        address _sequencer,
        address _oracleBase,
        uint256 _oracleBaseUpdateFrequency
    ) {
        sweep = ISweep(_sweep);
        base = IERC20Metadata(_base);
        quoter = IBalancerQuoter(_quoter);
        oracleBase = IPriceFeed(_oracleBase);
        sequencer = IPriceFeed(_sequencer);
        oracleBaseUpdateFrequency = _oracleBaseUpdateFrequency;
    }

    // Events
    event Bought(uint256 usdxAmount);
    event Sold(uint256 sweepAmount);

    function currentPrice() external returns(uint256) {
        bytes memory userData;
        SingleSwap memory swap = SingleSwap(poolId, SwapKind.GIVEN_IN, IAsset(address(sweep)), IAsset(address(base)), 1e18, userData);
        FundManagement memory funds = FundManagement(address(this), false, payable(msg.sender), false);
        uint256 price = quoter.querySwap(swap, funds);

        return price;
    }

    /**
     * @notice Get Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getPrice() public view returns (uint256 price) {
        if(address(pool) == address(0)) return 2e6;
        uint256 rate = pool.getTokenRate(address(sweep));
        uint8 rateDecimals = 18;

        uint256 stablePrice = ChainlinkLibrary.getPrice(
            oracleBase,
            sequencer,
            oracleBaseUpdateFrequency
        );

        uint8 oracleDecimals = ChainlinkLibrary.getDecimals(oracleBase);
        price = rate.mulDiv(stablePrice * (10 ** base.decimals()), 10 ** (oracleDecimals + rateDecimals));
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

    function getPositions(uint256) public view returns (uint256 usdxAmount, uint256 sweepAmount, uint256 lp) {
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

        poolId = pool.getPoolId();
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

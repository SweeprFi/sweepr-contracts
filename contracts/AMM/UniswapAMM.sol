// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ==========================================================
// ====================== UniswapAMM.sol ====================
// ==========================================================

/**
 * @title Uniswap AMM
 * @dev Interactions with UniswapV3
 */

import "../Libraries/Chainlink.sol";
import "../Utils/LiquidityHelper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../Balancer/IMarketMaker.sol";
import "../Sweep/ISweep.sol";

contract UniswapAMM {
    using Math for uint256;

    ISwapRouter private constant ROUTER = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    IERC20Metadata public immutable base;
    ISweep public immutable sweep;
    IPriceFeed public immutable oracleBase;
    IPriceFeed public immutable sequencer;
    address public immutable pool;
    uint256 public immutable oracleBaseUpdateFrequency;
    bool private immutable flag; // The sort status of tokens
    LiquidityHelper private immutable liquidityHelper;
    IMarketMaker public marketMaker;

    uint8 private constant USD_DECIMALS = 6;
    // Uniswap V3
    uint32 private constant LOOKBACK = 1 days;
    uint16 private constant DEADLINE_GAP = 15 minutes;

    constructor(
        address _sweep,
        address _base,
        address _sequencer,
        address _pool,
        address _oracleBase,
        uint256 _oracleBaseUpdateFrequency,
        address _liquidityHelper
    ) {
        sweep = ISweep(_sweep);
        base = IERC20Metadata(_base);
        oracleBase = IPriceFeed(_oracleBase);
        sequencer = IPriceFeed(_sequencer);
        pool = _pool;
        oracleBaseUpdateFrequency = _oracleBaseUpdateFrequency;
        liquidityHelper = LiquidityHelper(_liquidityHelper);
        flag = _base < _sweep;
    }

    // Events
    event Bought(uint256 usdxAmount);
    event Sold(uint256 sweepAmount);

    // Errors
    error OverZero();
    error NotOwnerOrGov();

    modifier onlyOwner () {
        if (msg.sender != sweep.fastMultisig() && msg.sender != sweep.owner())
            revert NotOwnerOrGov();
        _;
    }

    /**
     * @notice Get Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getPrice() public view returns (uint256 amountOut) {
        (, int24 tick, , , , , ) = IUniswapV3Pool(pool).slot0();

        uint256 quote = OracleLibrary.getQuoteAtTick(
            tick,
            uint128(10 ** sweep.decimals()),
            address(sweep),
            address(base)
        );
        uint256 price = ChainlinkLibrary.getPrice(
            oracleBase,
            sequencer,
            oracleBaseUpdateFrequency
        );
        uint8 decimals = ChainlinkLibrary.getDecimals(oracleBase);

        amountOut = quote.mulDiv(price, 10 ** decimals);
    }

    /**
     * @notice Get TWA Price
     * @dev Get the quote for selling 1 unit of a token.
     */
    function getTWAPrice() external view returns (uint256 amountOut) {
        uint256 price = ChainlinkLibrary.getPrice(
            oracleBase,
            sequencer,
            oracleBaseUpdateFrequency
        );
        uint8 decimals = ChainlinkLibrary.getDecimals(oracleBase);

        // Get the average price tick first
        (int24 arithmeticMeanTick, ) = OracleLibrary.consult(pool, LOOKBACK);

        // Get the quote for selling 1 unit of a token.
        uint256 quote = OracleLibrary.getQuoteAtTick(
            arithmeticMeanTick,
            uint128(10 ** sweep.decimals()),
            address(sweep),
            address(base)
        );

        amountOut = quote.mulDiv(price, 10 ** decimals);
    }

    function getPositions(uint256 tokenId)
        public view
        returns (uint256 usdxAmount, uint256 sweepAmount, uint256 lp)
    {
        lp = 0;
        (uint256 amount0, uint256 amount1) = liquidityHelper.getTokenAmountsFromLP(tokenId, pool);
        (usdxAmount, sweepAmount) = flag ? (amount0, amount1) : (amount1, amount0);
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
        bool lowerPriceInPool = true;

        if (address(marketMaker) != address(0)) {
            uint256 buyPrice = marketMaker.getBuyPrice();
            if (buyPrice < getPrice()) {
                lowerPriceInPool = false;
                uint256 usdxInUsd = ChainlinkLibrary.convertTokenToUsd(tokenAmount, base.decimals(), oracleBase);
                sweepAmount = sweep.convertToSWEEP(usdxInUsd);
                uint256 slippage = ((sweepAmount/amountOutMin)-1) * USD_DECIMALS;
                uint256 usdxMinIn = (tokenAmount * (USD_DECIMALS - slippage)) / USD_DECIMALS;

                TransferHelper.safeTransferFrom(address(base), msg.sender, address(this), tokenAmount);
                TransferHelper.safeApprove(address(base), address(marketMaker), tokenAmount);
                marketMaker.buySweep(tokenAmount, sweepAmount, usdxMinIn, amountOutMin, slippage);
                TransferHelper.safeTransfer(address(sweep), msg.sender, sweepAmount);
            }
        }

        if(lowerPriceInPool) {
            sweepAmount = swap(
                tokenAddress,
                address(sweep),
                tokenAmount,
                amountOutMin,
                pool
            );
        }

        emit Bought(tokenAmount);
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
        tokenAmount = swap(
            address(sweep),
            tokenAddress,
            sweepAmount,
            amountOutMin,
            pool
        );
    }

    /**
     * @notice Swap tokenA into tokenB using uniV3Router.ExactInputSingle()
     * @param tokenA Address to in
     * @param tokenB Address to out
     * @param amountIn Amount of _tokenA
     * @param amountOutMin Minimum amount out.
     * @param poolAddress Pool to use in the swap
     */
    function swap(
        address tokenA,
        address tokenB,
        uint256 amountIn,
        uint256 amountOutMin,
        address poolAddress
    ) public returns (uint256 amountOut) {
        // Approval
        TransferHelper.safeTransferFrom(tokenA, msg.sender, address(this), amountIn);
        TransferHelper.safeApprove(tokenA, address(ROUTER), amountIn);

        ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenA,
                tokenOut: tokenB,
                fee: IUniswapV3Pool(poolAddress).fee(),
                recipient: msg.sender,
                deadline: block.timestamp + DEADLINE_GAP,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            });

        amountOut = ROUTER.exactInputSingle(swapParams);
    }

    function setMarketMaker(address _marketMaker) external onlyOwner {
        marketMaker = IMarketMaker(_marketMaker);
    }
}

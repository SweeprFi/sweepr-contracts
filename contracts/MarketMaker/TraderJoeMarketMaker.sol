// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ======================= TraderJoeMarketMaker.sol ===================
// ====================================================================

/**
 * @title Trader Joe Stable/Stable Pool Market Maker
 * @dev Implementation:
 * Increases and decreases the liquidity
 */

import {Stabilizer, OvnMath} from "../Stabilizer/Stabilizer.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import {ILBPair, ILBRouter, IERC20} from "../Assets/Interfaces/TraderJoe/ITraderJoe.sol";
import {IAMM} from "../AMM/IAMM.sol";

contract TraderJoeMarketMaker is Stabilizer {
    error BadAddress();
    error BadSlippage();
    error NotMinted();

    event LiquidityAdded(uint256 usdxAmount, uint256 sweepAmount);
    event LiquidityRemoved(uint256 usdxAmount, uint256 sweepAmount);
    event SweepPurchased(uint256 usdxAmount, uint256 sweepAmount);

    ILBPair public pool;
    ILBRouter public immutable router;
    address public ammAddress;
    uint32 public slippage;
    uint256 public tradePosition;
    uint256 public growPosition;
    uint256 public redeemPosition;

    uint24 private constant PRECISION = 1e6;
    uint256 private constant LIQ_PRECISION = 1e18;
    bool private immutable flag;

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _oracleUsdx,
        address _poolAddress,
        address _router,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        slippage = 5000; // 0.5%
        pool = ILBPair(_poolAddress);
        router = ILBRouter(_router);
        flag = pool.getTokenX() == address(_usdx);
    }

    /* ========== Views ========== */

    /**
     * @notice Gets the asset price of AMM
     * @return the amm usdx amount
     */
    function assetValue() public view override returns (uint256) {
        uint256 totalX;
        uint256 totalY;
        uint256[3] memory positions = [tradePosition, growPosition, redeemPosition];

        for (uint i = 0; i < 3; i++) {
            if (positions[i] > 0) {
                uint24 positionId = uint24(positions[i]);
                uint256 balance = pool.balanceOf(address(this), positionId);
                uint256 totalSupply = pool.totalSupply(positionId);
                (uint256 binReserveX, uint256 binReserveY) = pool.getBin(uint24(positionId));
                totalX += balance * binReserveX / totalSupply;
                totalY += balance * binReserveY / totalSupply;
            }
        }

        (uint256 usdxAmount, uint256 sweepAmount) = flag ? (totalX, totalY) : (totalY, totalX);
        return _oracleUsdxToUsd(usdxAmount) + sweep.convertToUSD(sweepAmount);
    }

    function getBuyPrice() public view returns (uint256) {
        uint256 targetPrice = sweep.targetPrice();
        return targetPrice + ((sweep.arbSpread() * targetPrice) / PRECISION);
    }

    function amm() public view override returns (IAMM) {
        return IAMM(ammAddress);
    }

    function tradeLiquidity() external view returns (uint256) {
        return _getLiquidity(tradePosition);
    }

    function growLiquidity() external view returns (uint256) {
        return _getLiquidity(growPosition);
    }

    function redeemLiquidity() external view returns (uint256) {
        return _getLiquidity(redeemPosition);
    }

    /* ========== Actions ========== */
    function setSlippage(uint32 newSlippage) external nonReentrant onlyBorrower {
        if (newSlippage > PRECISION) revert BadSlippage();
        slippage = newSlippage;
    }

    function setAMM(address newAmm) external nonReentrant onlyBorrower {
        if (newAmm == address(0)) revert ZeroAddressDetected();
        ammAddress = newAmm;
    }

    function buySweep(uint256 usdxAmount) external nonReentrant returns (uint256 sweepAmount) {
        sweepAmount = (_oracleUsdxToUsd(usdxAmount) * (10 ** sweep.decimals())) / getBuyPrice();

        TransferHelper.safeTransferFrom(address(usdx), msg.sender, address(this), usdxAmount);
        _borrow(sweepAmount * 2);
        (uint256 amountX, uint256 amountY) = flag ? (usdxAmount, sweepAmount) : (sweepAmount, usdxAmount);
        uint256 amountXmin = OvnMath.subBasisPoints(amountX, slippage);
        uint256 amountYmin = OvnMath.subBasisPoints(amountY, slippage);

        uint256 binsAmount = 1;
        int256[] memory deltaIds = new int256[](binsAmount);
        uint256[] memory distributionX = new uint256[](binsAmount);
        uint256[] memory distributionY = new uint256[](binsAmount);

        deltaIds[0] = 0;
        distributionX[0] = LIQ_PRECISION;
        distributionY[0] = LIQ_PRECISION;

        _approveRouter(usdxAmount, sweepAmount);
        _addLiquidity(amountX, amountY, amountXmin, amountYmin, deltaIds, distributionX, distributionY);
        TransferHelper.safeTransfer(address(sweep), msg.sender, sweepAmount);

        _checkRatio();
        emit SweepPurchased(usdxAmount, sweepAmount);
    }

    /**
     * @notice Remove trade NFT
     */
    function removeTradePosition() external onlyBorrower nonReentrant {
        if(tradePosition == 0) revert NotMinted();
        _removePosition(tradePosition);
        tradePosition = 0;
    }

    /**
     * @notice Remove redeem NFT
     */
    function removeRedeemPosition() external onlyBorrower nonReentrant {
        if(redeemPosition == 0) revert NotMinted();
        _removePosition(redeemPosition);
        redeemPosition = 0;
    }

    /**
     * @notice Remove grow NFT
     */
    function removeGrowPosition() external onlyBorrower nonReentrant {
        if(growPosition == 0) revert NotMinted();
        _removePosition(growPosition);
        growPosition = 0;
    }

    function lpTrade(uint256 usdxAmount, uint256 sweepAmount, uint256 _slippage)
        external onlyBorrower whenNotPaused nonReentrant
    {
        if(tradePosition > 0) _removePosition(tradePosition);

        (uint256 amountX, uint256 amountY) = flag ? (usdxAmount, sweepAmount) : (sweepAmount, usdxAmount);
        uint256 amountXmin = OvnMath.subBasisPoints(amountX, _slippage);
        uint256 amountYmin = OvnMath.subBasisPoints(amountY, _slippage);

        uint256 binsAmount = 1;
        int256[] memory deltaIds = new int256[](binsAmount);
        uint256[] memory distributionX = new uint256[](binsAmount);
        uint256[] memory distributionY = new uint256[](binsAmount);

        deltaIds[0] = 0;
        distributionX[0] = LIQ_PRECISION;
        distributionY[0] = LIQ_PRECISION;

        _approveRouter(usdxAmount, sweepAmount);
        tradePosition = _addLiquidity(amountX, amountY, amountXmin, amountYmin, deltaIds, distributionX, distributionY);
    }

    function lpRedeem(uint256 usdxAmount, uint256 _slippage) external onlyBorrower nonReentrant {
        if(redeemPosition > 0) _removePosition(redeemPosition);
        _approveRouter(usdxAmount, 0);
        redeemPosition = _addSingleLiquidity(address(usdx), usdxAmount, _slippage);
    }

    function lpGrow(uint256 sweepAmount, uint256 _slippage) external onlyBorrower nonReentrant {
        if(growPosition > 0) _removePosition(growPosition);
        _approveRouter(0, sweepAmount);
        growPosition = _addSingleLiquidity(address(sweep), sweepAmount, _slippage);
    }

    function removePosition() external onlyBorrower nonReentrant {
        _removePosition(growPosition);
    }

    /* ========== Internals ========== */
    function _getLiquidity(uint256 position) internal view returns(uint256 liquidity) {
        if(position > 0)
            liquidity = pool.balanceOf(address(this), position);
    }

    function _removePosition(uint256 positionId) internal {
        uint256 LBTokenAmount = pool.balanceOf(address(this), positionId);
        uint256[] memory amounts = new uint256[](1);
        uint256[] memory ids = new uint256[](1);
        ids[0] = positionId;
        amounts[0] = LBTokenAmount;
        uint256 balance = pool.balanceOf(address(this), positionId);
        uint256 totalSupply = pool.totalSupply(positionId);
        (uint256 binReserveX, uint256 binReserveY) = pool.getBin(uint24(positionId));
        binReserveX = balance * binReserveX / totalSupply;
        binReserveY = balance * binReserveY / totalSupply;

        uint256 amountXMin = OvnMath.subBasisPoints(binReserveX, slippage);
        uint256 amountYMin = OvnMath.subBasisPoints(binReserveY, slippage);

        pool.approveForAll(address(router), true);

        router.removeLiquidity(
            IERC20(pool.getTokenX()),
            IERC20(pool.getTokenY()),
            pool.getBinStep(),
            amountXMin,
            amountYMin,
            ids,
            amounts,
            address(this),
            block.timestamp
        ); 
    }

    function _approveRouter(uint256 usdxAmount, uint256 sweepAmount) internal {
        if(usdxAmount > 0) TransferHelper.safeApprove(address(usdx), address(router), usdxAmount);
        if(sweepAmount > 0) TransferHelper.safeApprove(address(sweep), address(router), sweepAmount);
    }

    function _addLiquidity(
        uint256 amountX,
        uint256 amountY,
        uint256 amountXmin,
        uint256 amountYmin,
        int256[] memory deltaIds,
        uint256[] memory distributionX,
        uint256[] memory distributionY
    ) internal returns (uint256) {
        address self = address(this);
        uint256 activeIdDesired = pool.getActiveId();
        uint256 idSlippage = 5;

        ILBRouter.LiquidityParameters memory liquidityParameters = ILBRouter.LiquidityParameters(
            IERC20(pool.getTokenX()),
            IERC20(pool.getTokenY()),
            pool.getBinStep(),
            amountX,
            amountY,
            amountXmin,
            amountYmin,
            activeIdDesired,
            idSlippage,
            deltaIds,
            distributionX,
            distributionY,
            self,
            self,
            block.timestamp
        );

        (uint256 amountXAdded, uint256 amountYAdded,,,uint256[] memory depositIds,) = router.addLiquidity(liquidityParameters);
        if(flag) emit LiquidityAdded(amountXAdded, amountYAdded);
        else emit LiquidityAdded(amountYAdded, amountXAdded);

        return depositIds[0];
    }

    function _addSingleLiquidity(address token, uint256 tokenAmount, uint256 _slippage) internal returns (uint256) {
        uint256 binsAmount = 1;
        int256[] memory deltaIds = new int256[](binsAmount);
        uint256[] memory distributionX = new uint256[](binsAmount);
        uint256[] memory distributionY = new uint256[](binsAmount);
        uint256 amountX;
        uint256 amountY;
        uint256 amountXmin;
        uint256 amountYmin;

        if (pool.getTokenX() == token) {
            amountX = tokenAmount;
            amountXmin = OvnMath.subBasisPoints(amountX, _slippage);
            deltaIds[0] = 1;
            distributionX[0] = LIQ_PRECISION;
        } else {
            amountY = tokenAmount;
            amountYmin = OvnMath.subBasisPoints(amountY, _slippage);
            deltaIds[0] = -1;
            distributionY[0] = LIQ_PRECISION;
        }

        return _addLiquidity(amountX, amountY, amountXmin, amountYmin, deltaIds, distributionX, distributionY);
    }
}

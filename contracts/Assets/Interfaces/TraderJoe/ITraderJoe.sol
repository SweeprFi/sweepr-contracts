// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts/interfaces/IERC20.sol";

interface ILBPair {
    function getActiveId() external view returns (uint24 id);

    function getPriceFromId(uint24 id) external view returns (uint256 price);

    function getIdFromPrice(uint256 price) external view returns (uint24 id);

    function getTokenX() external view returns (address);

    function getTokenY() external view returns (address);

    function getBinStep() external view returns (uint16);

    function getReserves() external view returns (uint128[] memory);

    function balanceOf(address, uint256) external view returns (uint256);

    function totalSupply(uint256) external view returns (uint256);

    function getBin(uint24 id) external view returns (uint128 binReserveX, uint128 binReserveY);

    function getSwapOut(
        uint128 amountIn,
        bool swapForY
    ) external view returns (uint128 amountInLeft, uint128 amountOut, uint128 fee);

    function approveForAll(address, bool) external;

    function collectProtocolFees() external returns (bytes32);
}

interface ILBRouter {
    enum Version {V1, V2, V2_1}

    struct LiquidityParameters {
        IERC20 tokenX;
        IERC20 tokenY;
        uint256 binStep;
        uint256 amountX;
        uint256 amountY;
        uint256 amountXMin;
        uint256 amountYMin;
        uint256 activeIdDesired;
        uint256 idSlippage;
        int256[] deltaIds;
        uint256[] distributionX;
        uint256[] distributionY;
        address to;
        address refundTo;
        uint256 deadline;
    }

    struct Path {
        uint256[] pairBinSteps;
        Version[] versions;
        IERC20[] tokenPath;
    }

    function addLiquidity(LiquidityParameters calldata liquidityParameters)
        external
        returns (
            uint256 amountXAdded,
            uint256 amountYAdded,
            uint256 amountXLeft,
            uint256 amountYLeft,
            uint256[] memory depositIds,
            uint256[] memory liquidityMinted
        );

    function removeLiquidity(
        IERC20 tokenX,
        IERC20 tokenY,
        uint16 binStep,
        uint256 amountXMin,
        uint256 amountYMin,
        uint256[] memory ids,
        uint256[] memory amounts,
        address to,
        uint256 deadline
    ) external returns (uint256 amountX, uint256 amountY);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Path memory path,
        address to,
        uint256 deadline
    ) external returns (uint256 amountOut);
}

interface ILBFactory {
    struct LBPairInformation {
        uint16 binStep;
        ILBPair LBPair;
        bool createdByOwner;
        bool ignoredForRouting;
    }

    function createLBPair(IERC20 tokenX, IERC20 tokenY, uint24 activeId, uint16 binStep) external returns (ILBPair pair);

    function getLBPairInformation(IERC20 tokenX, IERC20 tokenY, uint256 binStep) external view returns (LBPairInformation memory lbPairsAvailable);

    // for tests -----------------------
    function owner() external view returns (address);

    function addQuoteAsset(IERC20 quoteAsset) external;
}

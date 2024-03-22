// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================= AgaveAsset.sol ===========================
// ====================================================================

/**
 * @title Agave Asset
 * @dev Representation of an on-chain investment on a Agave pool
 */

import { IERC20Metadata } from "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import { TransferHelper } from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import { Stabilizer, OvnMath } from "../Stabilizer/Stabilizer.sol";
import { ILendingPool, IAgaveOracle } from "./Interfaces/Agave/IAgave.sol";

contract AgaveAsset is Stabilizer {
    // Variables
    IERC20Metadata public immutable aToken;
    ILendingPool public immutable agavePool;

    uint16 private constant DEADLINE_GAP = 15 minutes;

    // Events
    event Invested(uint256 indexed usdxAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx, // wxDAI
        address _aToken, // agwxDAI
        address _agavePool,
        address _oracle,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracle, _borrower) {
        aToken = IERC20Metadata(_aToken);
        agavePool = ILendingPool(_agavePool);
    }

    /* ========== Views ========== */

    /**
     * @notice Get Asset Value
     * @return uint256 Asset Amount.
     */
    function assetValue() public view override returns (uint256) {
        uint256 aTokenBalance = aToken.balanceOf(address(this));
        
        return _oracleUsdxToUsd(aTokenBalance);
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest USDX
     * @param usdxAmount USDX Amount to be invested.
     */
    function invest(uint256 usdxAmount) 
        external onlyBorrower whenNotPaused nonReentrant validAmount(usdxAmount)
    {
        _invest(usdxAmount, 0, 0);
    }

    /**
     * @notice Divests From Agave.
     * @param usdxAmount Amount to be divested.
     */
    function divest(uint256 usdxAmount)
        external onlyBorrower nonReentrant validAmount(usdxAmount)
    {
        _divest(usdxAmount, 0);
    }

    function liquidate() external nonReentrant {
        if(auctionAllowed) revert ActionNotAllowed();
        _liquidate(_getToken(), getDebt());
    }

    /* ========== Internals ========== */

    function _getToken() internal view override returns (address) {
        return address(aToken);
    }

    /**
     * @notice Invest
     * @dev Deposits the amount into the Agave pool.
     */
    function _invest(uint256 usdxAmount, uint256, uint256) internal override {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(address(usdx), address(agavePool), usdxAmount);
        agavePool.deposit(address(usdx), usdxAmount, address(this), 0);

        emit Invested(usdxAmount);
    }

    /**
     * @notice Divest
     * @dev Withdraws the amount from the Agave pool.
     */
    function _divest(uint256 tokenAmount, uint256) internal override {
        if (aToken.balanceOf(address(this)) < tokenAmount)
            tokenAmount = type(uint256).max;

        agavePool.withdraw(address(usdx), tokenAmount, address(this));
        
        emit Divested(tokenAmount);
    }
}

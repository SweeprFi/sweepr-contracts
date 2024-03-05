// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ======================== YieldYakAsset.sol =========================
// ====================================================================


import { Stabilizer, TransferHelper } from "../Stabilizer/Stabilizer.sol";
import "./Interfaces/YieldYak/IYieldYakStrategy.sol";

contract YieldYakAsset is Stabilizer {

    // Variables
    IYieldYakStrategy public immutable strategy;

    // Events
    event Invested(uint256 indexed tokenAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _oracleUsdx,
        address _strategy,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        strategy = IYieldYakStrategy(_strategy);
    }

    /* ========== Views ========== */

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     * @dev the price is obtained from Chainlink
     */
    function assetValue() public view override returns (uint256) {
        uint256 shares = strategy.balanceOf(address(this));
        return _oracleUsdxToUsd(strategy.getDepositTokensForShares(shares));
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest.
     * @param usdxAmount Amount of usdx to be invested.
     */
    function invest(uint256 usdxAmount)
        external
        onlyBorrower
        whenNotPaused
        nonReentrant
        validAmount(usdxAmount)
    {
        _invest(usdxAmount, 0, 0);
    }

    /**
     * @notice Divest.
     * @param usdxAmount Amount to be divested.
     */
    function divest(uint256 usdxAmount)
        external
        onlyBorrower
        nonReentrant
        validAmount(usdxAmount)
    {
        _divest(usdxAmount, 0);
    }

    /**
     * @notice Liquidate
     */
    function liquidate() external nonReentrant {
        if(auctionAllowed) revert ActionNotAllowed();
        _liquidate(_getToken(), getDebt());
    }

    /* ========== Internals ========== */

    function _getToken() internal view override returns (address) {
        return address(strategy);
    }

    function _invest(uint256 usdxAmount, uint256, uint256) internal override {
        uint256 balance = usdx.balanceOf(address(this));
        if (balance == 0) revert NotEnoughBalance();
        if(usdxAmount > balance) usdxAmount = balance;

        TransferHelper.safeApprove(address(usdx), address(strategy), usdxAmount);
        strategy.deposit(usdxAmount);

        emit Invested(usdxAmount);
    }

    function _divest(uint256 usdxAmount, uint256) internal override {
        uint256 shares = strategy.balanceOf(address(this));
        uint256 divestAmount = strategy.getSharesForDepositTokens(usdxAmount);
        if(usdxAmount > shares) divestAmount = shares;

        strategy.withdraw(divestAmount);
        emit Divested(divestAmount);
    }

}

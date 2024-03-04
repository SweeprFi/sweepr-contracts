// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ========================== ERC4626Asset.sol ========================
// ====================================================================

/**
 * @title ERC4626 Asset
 * @dev Representation of an on-chain investment
 */
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "../Stabilizer/Stabilizer.sol";

contract ERC4626Asset is Stabilizer {
    // Variables
    IERC4626 public immutable asset;

    // Events
    event Invested(uint256 indexed tokenAmount);
    event Divested(uint256 indexed usdxAmount);

    constructor(
        string memory _name,
        address _sweep,
        address _usdx,
        address _asset,
        address _oracleUsdx,
        address _borrower
    ) Stabilizer(_name, _sweep, _usdx, _oracleUsdx, _borrower) {
        asset = IERC4626(_asset);
    }

    /* ========== Views ========== */

    /**
     * @notice Asset Value of investment.
     * @return the Returns the value of the investment in the USD coin
     * @dev the price is obtained from the target asset
     */
    function assetValue() public view virtual override returns (uint256) {
        uint256 sharesBalance = asset.balanceOf(address(this));
        uint256 assetsBalance = asset.convertToAssets(sharesBalance);

        return _oracleUsdxToUsd(assetsBalance);
    }

    /* ========== Actions ========== */

    /**
     * @notice Invest via ERC4626 deposit.
     * @param usdxAmount Amount to be deposited
     * @dev Sends usdx to the target asset to get shares.
     */
    function investDeposit(uint256 usdxAmount) public
        onlyBorrower
        whenNotPaused
        nonReentrant
        validAmount(usdxAmount)
    {
        _investDeposit(usdxAmount);
    }

    /**
     * @notice Invest via ERC4626 mint.
     * @param sharesAmount Amount to be obtained in the form of shares
     * @dev Sends usdx to the target asset to get shares.
     */
    function investMint(uint256 sharesAmount) public
        onlyBorrower
        whenNotPaused
        nonReentrant
        validAmount(sharesAmount)
    {
        _investMint(sharesAmount);
    }

    /**
     * @notice Divest via ERC4626 withdraw.
     * @param usdxAmount Amount to be obtained
     * @dev Gets usdx from the target asset by sending shares.
     */
    function divestWithdraw(uint256 usdxAmount) public
        onlyBorrower
        whenNotPaused
        nonReentrant
        validAmount(usdxAmount)
    {
        _divestWithdraw(usdxAmount);
    }

    /**
     * @notice Divest via ERC4626 redeem.
     * @param sharesAmount Amount to be redeemed
     * @dev Gets usdx from the target asset by sending shares.
     */
    function divestRedeem(uint256 sharesAmount) public
        onlyBorrower
        whenNotPaused
        nonReentrant
        validAmount(sharesAmount)
    {
        _divestRedeem(sharesAmount);
    }

    /**
     * @notice Invest.
     * @param usdxAmount Amount to be invested
     * @dev Sends usdx to the target asset to get shares.
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
     * @dev Gets usdx back by redeeming shares.
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

    function _investDeposit(uint256 usdxAmount) internal virtual {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(address(usdx), address(asset), usdxAmount);
        asset.deposit(usdxAmount, address(this));

        emit Invested(usdxAmount);
    }

    function _investMint(uint256 sharesAmount) internal virtual {
        uint256 usdxBalance = usdx.balanceOf(address(this));
        if (usdxBalance == 0) revert NotEnoughBalance();
        uint256 usdxAmount = asset.convertToAssets(sharesAmount);
        if (usdxBalance < usdxAmount) usdxAmount = usdxBalance;

        TransferHelper.safeApprove(address(usdx), address(asset), usdxAmount);
        asset.mint(sharesAmount, address(this));

        emit Invested(usdxAmount);
    }

    function _divestWithdraw(uint256 usdxAmount) internal virtual {
        uint256 sharesBalance = asset.balanceOf(address(this));
        if (sharesBalance == 0) revert NotEnoughBalance();
        uint256 sharesAmount = asset.convertToShares(usdxAmount);
        if (sharesBalance < sharesAmount) sharesAmount = sharesBalance;

        uint256 divestedAmount = asset.convertToAssets(sharesAmount);
        asset.withdraw(divestedAmount, address(this), address(this));

        emit Divested(divestedAmount);
    }

    function _divestRedeem(uint256 sharesAmount) internal virtual {
        uint256 sharesBalance = asset.balanceOf(address(this));
        if (sharesBalance == 0) revert NotEnoughBalance();
        if (sharesBalance < sharesAmount) sharesAmount = sharesBalance;

        uint256 divestedAmount = asset.convertToAssets(sharesAmount);
        asset.redeem(divestedAmount, address(this), address(this));
     
        emit Divested(divestedAmount);
    }

    function _invest(uint256 usdxAmount, uint256, uint256) internal virtual override {
        _investDeposit(usdxAmount);
    }

    function _divest(uint256 usdxAmount, uint256) internal virtual override {
        _divestWithdraw(usdxAmount);
    }

    function _getToken() internal view override returns (address) {
        return address(asset);
    }

}

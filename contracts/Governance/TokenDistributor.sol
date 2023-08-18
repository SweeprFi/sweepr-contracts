// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

// ====================================================================
// ====================== TokenDistributor.sol ========================
// ====================================================================

/**
 * @title Token Distributor
 * @dev Implementation:
 * The tokenDistributor will sell the SWEEPR tokens, get coins, and
 * send those coins to the Sweep treasury.
 */

import "./Sweepr.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract TokenDistributor is ReentrancyGuard {
    SweeprCoin public sweepr;
    address public treasury;
    uint256 public saleAmount;
    uint256 public salePrice;
    address public sellTo;
    address public payToken;

    /* ========== EVENTS ========== */
    event SweeprBought(address indexed buyer, uint256 amount);
    event Burned(uint256 amount);

    /* ========== Errors ========== */
    error NotOwner();
    error OverSaleAmount();
    error NotEnoughBalance();
    error NotRecipient();
    error ZeroPrice();
    error ZeroAmount();
    error ZeroAddressDetected();

    /* ========== Modifies ========== */
    modifier onlyOwner() {
        if (msg.sender != sweepr.owner()) revert NotOwner();
        _;
    }

    /* ========== CONSTRUCTOR ========== */
    constructor(address _sweepr, address _treasury) {
        sweepr = SweeprCoin(_sweepr);
        treasury = _treasury;
    }

    /* ========== PUBLIC FUNCTIONS ========== */
    /**
     * @notice A function to buy sweepr.
     * @param _tokenAmount sweep Amount to buy sweepr
     */
    function buy(uint256 _tokenAmount) external nonReentrant returns (uint256) {
        uint256 sweeprBalance = sweepr.balanceOf(address(this));
        uint256 sweeprAmount = (_tokenAmount * 10 ** sweepr.decimals()) /
            salePrice;

        if (msg.sender != sellTo) revert NotRecipient();
        if (sweeprAmount > saleAmount) revert OverSaleAmount();
        if (sweeprAmount > sweeprBalance) revert NotEnoughBalance();

        saleAmount -= sweeprAmount;
        TransferHelper.safeTransferFrom(
            payToken,
            msg.sender,
            treasury,
            _tokenAmount
        );
        TransferHelper.safeTransfer(address(sweepr), msg.sender, sweeprAmount);
        emit SweeprBought(msg.sender, sweeprAmount);

        return sweeprAmount;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */
    /**
     * @notice A function to allow sale
     * @param _saleAmount number of SWEEPR to sell
     * @param _sellTo address of the recipient
     * @param _salePrice price of SWEEPR in payToken
     * @param _payToken token address to receive
     */
    function allowSale(
        uint256 _saleAmount,
        address _sellTo,
        uint256 _salePrice,
        address _payToken
    ) external onlyOwner {
        if (_sellTo == address(0) || _payToken == address(0))
            revert ZeroAddressDetected();
        if (_saleAmount == 0) revert ZeroAmount();
        if (_salePrice == 0) revert ZeroPrice();

        saleAmount = _saleAmount;
        sellTo = _sellTo;
        salePrice = _salePrice;
        payToken = _payToken;
    }

    /**
     * @notice A function to revoke sale
     */
    function revokeSale() external onlyOwner {
        saleAmount = 0;
    }

    /**
     * @notice A function to burn SWEEPR
     */
    function burn() external onlyOwner returns (uint256) {
        uint256 sweeprBalance = sweepr.balanceOf(address(this));
        sweepr.burn(sweeprBalance);
        emit Burned(sweeprBalance);

        return sweeprBalance;
    }
}

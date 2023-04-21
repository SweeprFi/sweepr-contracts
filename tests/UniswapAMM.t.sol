// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../contracts/AMM/UniswapAMM.sol";

contract UniswapAMMTest is Test {
    UniswapAMM public uniswapAMM;
    address public sweepAddress = 0x4F4219c9B851AEbB652DD182D944A99b0b68edcf;
    address public usdcAddress = 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8;
    address public uniswapPool = 0xF75F92BF819FcBA96209990aE040DABd9Fd1c067;
    
    uint256 constant USDC_AMOUNT = 100e6;
    uint256 constant SWEEP_AMOUNT = 100e18;
    uint256 constant ZERO = 0;

    function setUp() public {
        uniswapAMM = new UniswapAMM(sweepAddress);
        
        vm.prank(uniswapPool);
        TransferHelper.safeTransfer(usdcAddress, address(this), USDC_AMOUNT);
        vm.prank(uniswapPool);
        TransferHelper.safeTransfer(sweepAddress, address(this), SWEEP_AMOUNT);
    }

    function test_buySweep() public {
        emit log("Buys some SWEEP on UniswapAMM correctly");
        uint256 sweepBefore = IERC20(sweepAddress).balanceOf(address(this));
        uint256 usdcBefore = IERC20(usdcAddress).balanceOf(address(this));

        // check the balances
        assertTrue(sweepBefore == SWEEP_AMOUNT);
        assertTrue(usdcBefore == USDC_AMOUNT);
        
        // Approve USDC for UniswapAMM
        TransferHelper.safeApprove(usdcAddress, address(uniswapAMM), USDC_AMOUNT);
        uint256 sweepAmount = uniswapAMM.buySweep(usdcAddress, USDC_AMOUNT, ZERO);
        uint256 sweepAfter = IERC20(sweepAddress).balanceOf(address(this));
        uint256 usdcAfter = IERC20(usdcAddress).balanceOf(address(this));
        
        assertTrue(sweepAmount > ZERO, "Failed to buy sweep");
        assertTrue(sweepAfter > sweepAmount);
        assertTrue(usdcAfter == ZERO);
    }

    function test_sellSweep() public {
        emit log("Sells some SWEEP on UniswapAMM correctly");
        uint256 sweepBefore = IERC20(sweepAddress).balanceOf(address(this));
        uint256 usdcBefore = IERC20(usdcAddress).balanceOf(address(this));

        // check the balances
        assertTrue(sweepBefore == SWEEP_AMOUNT);
        assertTrue(usdcBefore == USDC_AMOUNT);

        // Approve sweep for Uniswap router
        TransferHelper.safeApprove(sweepAddress, address(uniswapAMM), SWEEP_AMOUNT);
        uint256 usdcAmount = uniswapAMM.sellSweep(usdcAddress, SWEEP_AMOUNT, ZERO);
        uint256 sweepAfter = IERC20(sweepAddress).balanceOf(address(this));
        uint256 usdcAfter = IERC20(usdcAddress).balanceOf(address(this));
        
        assertTrue(usdcAmount > ZERO, "Failed to buy sweep");
        assertTrue(usdcAfter > usdcAmount);
        assertTrue(sweepAfter == ZERO);
    }
}

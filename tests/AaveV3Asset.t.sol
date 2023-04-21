// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "./BaseSetup.sol";
import "../contracts/Assets/AaveV3Asset.sol";

contract AaveV3AssetTest is BaseSetup {
    AaveV3Asset public asset;
    address public aavePoolAddress = 0x794a61358D6845594F94dc1DB02A252b5b4814aD;

    function setUp() public override {
        BaseSetup.setUp();

        asset = new AaveV3Asset(
            "Aave V3 asset",
            address(sweep),
            usdcAddress,
            aaveUsdcAddress,
            aavePoolAddress,
            address(amm),
            user1,
            address(usdcOracle)
        );

        int256 ratio = 1e5;
        uint256 fee = 1e4;
        uint256 limit = 1000e18;
        uint256 investAmount = 50e18;

        vm.prank(user1);
        asset.configure(ratio, fee, limit, fee, ZERO, ratio, investAmount, true, "");
        vm.prank(owner);
        sweep.addMinter(address(asset), limit);
    }

    function testFail_configuration() public {
        emit log("Only borrower can configure the asset");
        vm.prank(user2);
        asset.configure(int256(ZERO), ZERO, ZERO, ZERO, ZERO, int256(ZERO), ZERO, true, "");
    }

    function test_invest() public {
        emit log("Deposits, mint and invest into the Aave V3 pool");
        assertEq(asset.currentValue(), ZERO);
        assertEq(asset.assetValue(), ZERO);
        assertEq(sweep.balanceOf(address(asset)), ZERO);
        assertEq(IERC20(usdcAddress).balanceOf(address(asset)), ZERO);

        vm.prank(user1);
        IERC20(usdcAddress).transfer(address(asset), USDC_AMOUNT);
        vm.prank(user1);
        asset.borrow(800e18);

        assertEq(asset.sweep_borrowed(), SWEEP_AMOUNT);
        assertEq(sweep.balanceOf(address(asset)), SWEEP_AMOUNT);
        assertEq(IERC20(usdcAddress).balanceOf(address(asset)), USDC_AMOUNT);

        vm.prank(user1);
        asset.sellSweepOnAMM(SWEEP_AMOUNT, ZERO);

        uint256 balance = IERC20(usdcAddress).balanceOf(address(asset));

        vm.prank(user1);
        asset.invest(balance);

        assertEq(asset.sweep_borrowed(), SWEEP_AMOUNT);
        assertEq(sweep.balanceOf(address(asset)), ZERO);
        assertEq(IERC20(usdcAddress).balanceOf(address(asset)), ZERO);
        assertEq(asset.assetValue(), asset.currentValue());
    }

    function test_divest() public {
        emit log("Divest and withdraw");
        uint256 balance = IERC20(usdcAddress).balanceOf(user1);
        assertEq(asset.currentValue(), ZERO);
        assertEq(asset.assetValue(), ZERO);
        
        vm.prank(user1);
        IERC20(usdcAddress).transfer(address(asset), USDC_AMOUNT);
        assertEq(asset.currentValue(), USDC_AMOUNT);
        
        vm.prank(user1);
        asset.invest(USDC_AMOUNT);
        assertEq(asset.assetValue(), USDC_AMOUNT);
        assertEq(asset.currentValue(), asset.assetValue());
        assertLe(IERC20(usdcAddress).balanceOf(user1), balance);
        
        vm.prank(user1);
        asset.divest(type(uint256).max);
        assertEq(asset.currentValue(), USDC_AMOUNT);
        assertEq(asset.assetValue(), ZERO);

        vm.prank(user1);
        asset.withdraw(usdcAddress, USDC_AMOUNT);
        assertEq(IERC20(usdcAddress).balanceOf(user1), balance);
    }
}
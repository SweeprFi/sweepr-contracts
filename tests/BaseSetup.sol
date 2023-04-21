// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0;

import "forge-std/Test.sol";
import { Utils } from "./Utils.sol";
import "../contracts/Mocks/SweepMock.sol";
import "../contracts/Mocks/UniswapMock.sol";
import "../contracts/Mocks/AggregatorMock.sol";

contract BaseSetup is Test {
    // users
    address payable[] internal users;
    address internal owner;
    address internal user1;
    address internal user2;
    address internal user3;
    address internal user4;
    address internal treasury;

    // constants
    address internal usdcAddress = 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8;
    address internal wethAddress = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address internal wbtcAddress = 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f;
    address internal aaveUsdcAddress = 0x625E7708f30cA75bfd92586e17077590C60eb4cD;

    uint256 constant USDC_AMOUNT = 100e6;
    uint256 constant SWEEP_AMOUNT = 800e18;
    uint256 constant ZERO = 0;

    // contracts
    Utils internal utils;
    SweepMock internal sweep;
    UniswapMock internal amm;
    AggregatorMock internal usdcOracle;
    AggregatorMock internal wethOracle;
    AggregatorMock internal wbtcOracle;

    // setup
    function setUp() public virtual {
        utils = new Utils();
        users = utils.createUsers(6);

        owner = users[0];
        vm.label(owner, "OWNER");
        user1 = users[1];
        vm.label(user1, "USER 1");
        user2 = users[2];
        vm.label(user2, "USER 2");
        user3 = users[3];
        vm.label(user3, "USER 3");
        user4 = users[4];
        vm.label(user4, "USER 4");
        treasury = users[5];
        vm.label(treasury, "treasury");

        // deploy all contracts
        deploysOracles();
        deploySweep();
        sendFounds();
    }

    function deploysOracles() private {
        usdcOracle = new AggregatorMock();
        wethOracle = new AggregatorMock();
        wbtcOracle = new AggregatorMock();

        wethOracle.setPrice(1900e8);  // 1900 USD
        wbtcOracle.setPrice(28000e8); // 28000 USD
    }

    function deploySweep() private {
        sweep = new SweepMock();
        vm.prank(owner);
        sweep.initialize(treasury);
        vm.prank(owner);
        sweep.setTreasury(treasury);

        amm = new UniswapMock(address(sweep));
    }

    function sendFounds() private {
        vm.prank(owner);
        sweep.transfer(address(amm), 1000e18);
        vm.prank(usdcAddress);
        IERC20(usdcAddress).transfer(address(amm), 1000e6);
        vm.prank(usdcAddress);
        IERC20(usdcAddress).transfer(user1, 1000e6);
    }
}

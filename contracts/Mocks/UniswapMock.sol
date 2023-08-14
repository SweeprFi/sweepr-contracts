//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.11;

import "../Sweep/ISweep.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract UniswapMock {
    uint256 public price;
    uint256 public twaPrice;
    uint24 public immutable poolFee;
    address public sweepAddress;
    address public sequencer;

    constructor(
        address _sweepAddress,
        uint24 _poolFee
    ) {
        sweepAddress = _sweepAddress;
        poolFee = _poolFee;
        price = ISweep(_sweepAddress).targetPrice();
    }

    function setPrice(uint256 _price) public {
        price = _price;
    }

    function getPrice() public view returns (uint256) {
        return price;
    }

    function setTWAPrice(uint256 _price) public {
        twaPrice = _price;
    }

    function getTWAPrice() public view returns (uint256) {
        return twaPrice;
    }

    function buySweep(
        address _collateral_address,
        uint256 _collateral_amount,
        uint256 _amountOutMin
    ) public returns (uint256 sweep_amount) {
        sweep_amount = swapExactInput(
            _collateral_address,
            sweepAddress,
            _collateral_amount,
            _amountOutMin
        );
    }

    function sellSweep(
        address _collateral_address,
        uint256 _sweep_amount,
        uint256 _amountOutMin
    ) public returns (uint256 collateral_amount) {
        collateral_amount = swapExactInput(
            sweepAddress,
            _collateral_address,
            _sweep_amount,
            _amountOutMin
        );
    }

    function swapExactInput(
        address _tokenA,
        address _tokenB,
        uint256 _amount,
        uint256 _amount_out_min
    ) public returns (uint256 result) {
        _amount_out_min;

        ERC20(_tokenA).transferFrom(msg.sender, address(this), _amount);
        uint8 decimalsA = ERC20(_tokenA).decimals();
        uint8 decimalsB = ERC20(_tokenB).decimals();

        // TODO: minus poolFee, not 3000

        if (decimalsA > 6) {
            result = ((_amount * price) * (1e6 - poolFee)) / ((10 ** decimalsA) * 1e6);
        } else {
            result = ((_amount * (10 ** decimalsB) * (1e6 - poolFee)) / (price * 1e6));
        }
        ERC20(_tokenB).transfer(msg.sender, result);
    }
}
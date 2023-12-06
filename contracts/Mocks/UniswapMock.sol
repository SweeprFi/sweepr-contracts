//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.11;

import "../Sweep/ISweep.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

contract UniswapMock {
    uint256 public price;
    uint256 public twaPrice;
    address public immutable poolAddress;
    address public sweepAddress;
    address public sequencer;

    constructor(
        address _sweepAddress,
        address _poolAddress
    ) {
        sweepAddress = _sweepAddress;
        poolAddress = _poolAddress;
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
        sweep_amount = swap(
            _collateral_address,
            sweepAddress,
            _collateral_amount,
            _amountOutMin,
            poolAddress
        );
    }

    function sellSweep(
        address _collateral_address,
        uint256 _sweep_amount,
        uint256 _amountOutMin
    ) public returns (uint256 collateral_amount) {
        collateral_amount = swap(
            sweepAddress,
            _collateral_address,
            _sweep_amount,
            _amountOutMin,
            poolAddress
        );
    }

    function swap(
        address _tokenA,
        address _tokenB,
        uint256 _amount,
        uint256 _amount_out_min,
        address
    ) public returns (uint256 result) {
        _amount_out_min;

        ERC20(_tokenA).transferFrom(msg.sender, address(this), _amount);
        uint8 decimalsA = ERC20(_tokenA).decimals();
        uint8 decimalsB = ERC20(_tokenB).decimals();

        uint256 _fee = 500;

        if (decimalsA > 6) {
            result = ((_amount * price) * (1e6 - _fee)) / ((10 ** decimalsA) * 1e6);
        } else {
            result = ((_amount * (10 ** decimalsB) * (1e6 - _fee)) / (price * 1e6));
        }
        ERC20(_tokenB).transfer(msg.sender, result);
    }
}
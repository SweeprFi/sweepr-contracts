//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.11;
import "../Common/ERC20/ERC20.sol";
import "../Sweep/ISweep.sol";

contract UniswapMock {
    ISweep private SWEEP;
    ERC20 private USDC;

    constructor(address _sweep, address _usdc) {
        SWEEP = ISweep(_sweep);
        USDC = ERC20(_usdc);
    }

    function buySweep(
        address _collateral_address,
        uint256 _collateral_amount,
        uint256 _amountOutMin
    ) public returns (uint256 sweep_amount) {
        sweep_amount = swapExactInput(
            _collateral_address,
            address(SWEEP),
            3000,
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
            address(SWEEP),
            _collateral_address,
            3000,
            _sweep_amount,
            _amountOutMin
        );
    }

    function swapExactInput(
        address _tokenA,
        address _tokenB,
        uint24 _fee,
        uint256 _amount,
        uint256 _amount_out_min
    ) public returns (uint256 result) {
        _fee;
        _tokenB;
        _amount_out_min;

        uint256 price = SWEEP.target_price();
        ERC20(_tokenA).transferFrom(msg.sender, address(this), _amount);

        if (_tokenA == address(SWEEP)) {
            result = ((_amount * price) * (1e6 - _fee)) / 1e18 / 1e6;
            USDC.transfer(msg.sender, result);
        } else {
            result = (((_amount * 1e18) / price) * (1e6 - _fee)) / 1e6;
            SWEEP.transfer(msg.sender, result);
        }
    }
}
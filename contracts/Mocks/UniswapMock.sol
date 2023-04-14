//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.11;
import "../Common/ERC20/ERC20.sol";
import "../Sweep/ISweep.sol";

contract UniswapMock {
    ISweep private SWEEP;

    constructor(address _sweep) {
        SWEEP = ISweep(_sweep);
    }

    function buySweep(
        address _collateral_address,
        uint256 _collateral_amount,
        uint256 _amountOutMin
    ) public returns (uint256 sweep_amount) {
        sweep_amount = swapExactInput(
            _collateral_address,
            address(SWEEP),
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

        uint256 price = SWEEP.target_price();
        ERC20(_tokenA).transferFrom(msg.sender, address(this), _amount);

        if (ERC20(_tokenA).decimals() == 18) {
            result = ((_amount * price) * (1e6 - 3000)) / 1e18 / 1e6;
        } else {
            result = (((_amount * 1e18) / price) * (1e6 - 3000)) / 1e6;
        }
        ERC20(_tokenB).transfer(msg.sender, result);
    }
}
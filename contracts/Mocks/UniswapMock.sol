//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.11;

import "../Sweep/ISweep.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract UniswapMock {
    ISweep private SWEEP;
    uint256 public price;
    uint256 public poolFee = 500;
    address public immutable usdOracle;
    address public immutable sequencerUptimeFeed;

    constructor(address _sweep, address _usd_oracle_address, address _sequencer_address) {
        SWEEP = ISweep(_sweep);
        price = SWEEP.target_price();
        usdOracle =  _usd_oracle_address;
        sequencerUptimeFeed = _sequencer_address;
    }

    function setPrice(uint256 _price) public {
        price = _price;
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

        ERC20(_tokenA).transferFrom(msg.sender, address(this), _amount);
        uint8 decimalsA = ERC20(_tokenA).decimals();
        uint8 decimalsB = ERC20(_tokenB).decimals();

        if (decimalsA > 6) {
            result = ((_amount * price) * (1e6 - 3000)) / ((10 ** decimalsA) * 1e6);
        } else {
            result = ((_amount * (10 ** decimalsB) * (1e6 - 3000)) / (price * 1e6));
        }
        ERC20(_tokenB).transfer(msg.sender, result);
    }
}
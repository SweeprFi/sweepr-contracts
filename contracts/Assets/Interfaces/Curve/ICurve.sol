// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface ICurvePoolFactory {
    function deploy_plain_pool(
        string memory _name,
        string memory _symbol,
        address[] memory _coins,
        uint256 _A,
        uint256 _fee,
        uint256 _offpeg_fee_multiplier,
        uint256 _ma_exp_time,
        uint256 _implementation_idx,
        uint8[] memory _asset_types,
        bytes4[] memory _method_ids,
        address[] memory _oracles
    ) external returns (address);
}

interface ICurvePool {
    function exchange(int128 i, int128 j, uint256 _dx, uint256 _min_dy, address _receiver) external returns (uint256);
    function exchange_received(int128 i, int128 j, uint256 _dx, uint256 _min_dy, address _receiver) external returns (uint256);

    function add_liquidity(uint256[] memory _amounts, uint256 _min_mint_amount) external returns (uint256);
    function remove_liquidity(uint256 _burn_amount, uint256[] memory _min_amounts) external returns (uint256[] memory);
    function remove_liquidity_one_coin(uint256 _burn_amount, int128 _i, uint256 _min_received) external returns (uint256);
    function remove_liquidity_imbalance(uint256[] memory _amounts, uint256 _max_burn_amount) external returns (uint256);

    function last_price(uint256 i) external view returns (uint256);
    function ema_price(uint256 i) external view returns (uint256);
    function price_oracle(uint256 i) external view returns (uint256);
    function stored_rates() external view returns (uint256[] memory);
    function get_virtual_price() external view returns (uint256);

    function balances(uint256 i) external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function decimals() external view returns (uint8);
}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract ChainlinkPricer {
    AggregatorV3Interface private immutable priceFeed;
    AggregatorV3Interface private immutable sequencerFeed;
    uint256 private constant GRACE_PERIOD = 1 hours;

    // Errors
    error AddressZeroDetected();
    error GracePeriodNotOver();
    error SequencerDown();
    error InvalidPrice();
    error StalePrice();

    constructor(address _usd_oracle_address, address _sequencer_feed_address) {
        if (_usd_oracle_address == address(0)) revert AddressZeroDetected();

        priceFeed = AggregatorV3Interface(_usd_oracle_address);
        sequencerFeed = AggregatorV3Interface(_sequencer_feed_address);
    }

    /**
     * Returns the latest price
     */
    function getLatestPrice(uint256 frequency) external view returns (int) {
        if (address(sequencerFeed) != address(0)) checkUptime();

        (uint256 roundId, int price, , uint256 updatedAt, ) = priceFeed.latestRoundData();

        if (price <= 0 || roundId == 0) revert InvalidPrice();
        if (updatedAt == 0 || updatedAt == 0) revert InvalidPrice();
        if(block.timestamp - updatedAt > frequency) revert StalePrice();

        return price;
    }

    function getDecimals() external view returns (uint8) {
        return priceFeed.decimals();
    }

    function checkUptime() internal view {
        (, int256 answer, uint256 startedAt, , ) = sequencerFeed.latestRoundData();
        // answer == 0: Sequencer is up
        // answer == 1: Sequencer is down
        if (answer > 0) revert SequencerDown();
        if (block.timestamp - startedAt <= GRACE_PERIOD)
            revert GracePeriodNotOver();
    }
}


// usdc --> 1 days
// weth --> 1 days
// wbtc --> 1 days

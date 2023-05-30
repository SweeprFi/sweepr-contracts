// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

library ChainlinkPricer {
    // Errors
    error AddressZeroDetected();
    error GracePeriodNotOver();
    error SequencerDown();
    error InvalidPrice();
    error StalePrice();

    /**
     * Returns the latest price
     */
    function getLatestPrice(
        address priceFeed,
        address sequencerFeed,
        uint256 frequency
    ) internal view returns (int256 price, uint8 decimals) {
        decimals = AggregatorV3Interface(priceFeed).decimals();
        if (address(sequencerFeed) != address(0)) checkUptime(sequencerFeed);

        (
            uint256 roundId,
            int256 _price,
            ,
            uint256 updatedAt,

        ) = AggregatorV3Interface(priceFeed).latestRoundData();

        if (_price <= 0 || roundId == 0) revert InvalidPrice();
        if (updatedAt == 0 || updatedAt == 0) revert InvalidPrice();
        if (frequency > 0 && (block.timestamp - updatedAt > frequency))
            revert StalePrice();
        price = _price;
    }

    function checkUptime(address sequencerFeed) internal view {
        (, int256 answer, uint256 startedAt, , ) = AggregatorV3Interface(
            sequencerFeed
        ).latestRoundData();
        // answer == 0: Sequencer is up
        // answer == 1: Sequencer is down
        if (answer > 0) revert SequencerDown();
        if (block.timestamp - startedAt <= 1 hours) revert GracePeriodNotOver();
    }
}

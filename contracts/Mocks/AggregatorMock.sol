// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

contract AggregatorMock {
    int256 price;
    constructor() {
        price = 1e8;
    }

    function setPrice(int256 _price) public {
        price = _price;
    }

    function decimals() public pure returns (uint8) {
        return 8;
    }

    function latestRoundData()
        public
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = 20e18;
        answer = price;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
        answeredInRound = 20e18;
    }
}

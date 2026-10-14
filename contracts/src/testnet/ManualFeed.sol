// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice TESTNET ONLY. Metis Sepolia has no Chainlink METIS/USD feed, so the testnet deployment
/// uses this owner-set stand-in with the same read interface. Mainnet uses Chainlink.
contract ManualFeed is Ownable {
    uint8 public constant decimals = 8;
    string public constant description = "METIS / USD (manual, testnet only)";
    int256 private _answer;
    uint256 private _updatedAt;
    uint80 private _round;

    event AnswerSet(int256 answer);

    constructor(address initialOwner, int256 answer) Ownable(initialOwner) {
        _set(answer);
    }

    function set(int256 answer) external onlyOwner {
        _set(answer);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (_round, _answer, _updatedAt, _updatedAt, _round);
    }

    function _set(int256 answer) private {
        _answer = answer;
        _updatedAt = block.timestamp;
        _round += 1;
        emit AnswerSet(answer);
    }
}

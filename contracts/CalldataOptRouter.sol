// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {V2SwapRouter} from './modules/uniswap/v2/V2SwapRouter.sol';
import {V3SwapRouter} from './modules/uniswap/v3/V3SwapRouter.sol';

abstract contract CalldataOptRouter is V2SwapRouter, V3SwapRouter {
    error TooLargeOfNumber();

    uint256 constant AMOUNT_IN_OFFSET = 2;

    /// @notice Thrown when executing commands with an expired deadline
    error TransactionDeadlinePassed();
    error OutOfTime();

    uint256 constant DEADLINE_OFFSET = 1698337979; // current unix time
    uint256 constant DEADLINE_GRANULARITY = 600; // 10 min increments
    uint256 constant END_OF_TIME = DEADLINE_OFFSET + (DEADLINE_GRANULARITY * type(uint16).max);

    modifier checkDeadline(bytes calldata swapInfo) {
        _checkDeadline(uint16(bytes2(swapInfo[:2])));
        _;
    }

    function v2SwapExactTokenForToken();
    function v2SwapTokenForExactToken();
    function v2SwapExactETHForToken();
    function v2SwapTokenForExactETH();
    function v3SwapExactTokenForToken(bytes calldata swapInfo) external checkDeadline(swapInfo) {}

    function v3SwapTokenForExactToken();
    function v3SwapExactETHForToken();
    function v3SwapTokenForExactETH();

    function _calcuateAmount(bytes calldata swapInfo, uint256 offset) internal pure returns (uint256) {
        uint8 numBytes = uint8(bytes1(swapInfo[offset]));
        if (numBytes >= 32) revert TooLargeOfNumber();
        bytes memory rawBytes = swapInfo[offset + 1:offset + 1 + numBytes];
        return _bytesToUint(rawBytes);
    }

    function _bytesToUint(bytes memory b) internal pure returns (uint256) {
        uint256 number = uint256(bytes32(b));
        return number;
    }

    function _checkDeadline(uint16 deadline) internal {
        if (END_OF_TIME >= block.timestamp) revert OutOfTime();
        if (DEADLINE_OFFSET + (deadline * DEADLINE_GRANULARITY) > block.timestamp) revert TransactionDeadlinePassed();
    }

    function _encodePath();
}

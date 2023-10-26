// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {V2SwapRouter} from './modules/uniswap/v2/V2SwapRouter.sol';
import {V3SwapRouter} from './modules/uniswap/v3/V3SwapRouter.sol';

abstract contract CalldataOptRouter is V2SwapRouter, V3SwapRouter {
    error TooLargeOfNumber();

    error TooManyHops();
    error NoFeeData();
    error NoFeeTier();

    uint256 constant AMOUNT_IN_OFFSET = 2;
    uint256 constant MAX_ADDRESSES = 9;
    uint256 constant MAX_HOPS = 8;
    uint256 constant ADDRESS_LENGTH = 20;
    uint256 constant FEE_BIT_SIZE = 2;

    uint24 constant TIER_0 = 100;
    uint24 constant TIER_1 = 500;
    uint24 constant TIER_2 = 3000;
    uint24 constant TIER_3 = 10000;

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

    // function v2SwapExactTokenForToken();
    // function v2SwapTokenForExactToken();
    // function v2SwapExactETHForToken();
    // function v2SwapTokenForExactETH();

    function v3SwapExactTokenForToken(bytes calldata swapInfo) external checkDeadline(swapInfo) {
        uint256 amountIn;
        uint256 amountOutMinimum;
        bytes memory path;

        (amountIn, amountOutMinimum, path) = _decodeCalldata(swapInfo[2:]);

        v3SwapExactInput(msg.sender, amountIn, amountOutMinimum, path, msg.sender);
    }

    function v3SwapTokenForExactToken(bytes calldata swapInfo) external checkDeadline(swapInfo) {
        uint256 amountInMaximum;
        uint256 amountOut;
        bytes memory path;

        (amountInMaximum, amountOut, path) = _decodeCalldata(swapInfo[2:]);

        v3SwapExactOutput(msg.sender, amountOut, amountInMaximum, path, msg.sender);
    }

    function v3SwapExactETHForToken(bytes calldata swapInfo) external payable checkDeadline(swapInfo) {
        uint256 amountIn;
        uint256 amountOutMinimum;
        bytes memory path;

        (amountIn, amountOutMinimum, path) = _decodeCalldata(swapInfo[2:]);

        v3SwapExactInput(msg.sender, amountIn, amountOutMinimum, path, address(this));
    }

    function v3SwapTokenForExactETH(bytes calldata swapInfo) external checkDeadline(swapInfo) {
        uint256 amountIn;
        uint256 amountOutMinimum;
        bytes memory path;

        (amountIn, amountOutMinimum, path) = _decodeCalldata(swapInfo[2:]);

        v3SwapExactOutput(address(this), amountIn, amountOutMinimum, path, msg.sender);
    }

    function _decodeCalldata(bytes calldata swapInfo)
        internal
        pure
        returns (uint256 amountIn, uint256 amountOut, bytes memory path)
    {
        uint256 amountInLength;
        uint256 amountOutLength;

        (amountIn, amountInLength) = _calculateAmount(swapInfo);
        (amountOut, amountOutLength) = _calculateAmount(swapInfo[amountInLength + 1:]);
        path = _parsePaths(swapInfo[amountInLength + 1 + amountOutLength + 1]);
    }

    function _calculateAmount(bytes calldata swapInfo) internal pure returns (uint256, uint256) {
        uint256 amountLength = uint256(uint8(bytes1(swapInfo[0])));
        if (amountLength >= 32) revert TooLargeOfNumber();
        uint256 amount = uint256(bytes32(swapInfo[1:amountLength + 1]));
        uint256 maskedAmount = (2 ** (amountLength * 8)) - 1 & amount;
        return (maskedAmount, amountLength);
    }

    function _parsePathes(bytes calldata swapInfo) internal pure returns (bytes memory) {
        // cap num addresses at 9, fee tiers at 8, so 2 bytes (2 bits * 8), so divide by 4
        // with this, you cannot have more than 20 addresses ever (might be uneccesary)
        if (swapInfo.length > MAX_ADDRESSES * ADDRESS_LENGTH + (MAX_HOPS / 4) || swapInfo.length >= ADDRESS_LENGTH * 20)
        {
            revert TooManyHops();
        }

        // receives 20 bytes repeating followed by sets of 2 bit representing fee tiers followed by padding (will either be 1 or 2 bytes)
        // returns of 20 bytes for each address, followed by 3 bytes for the fee tier, repeat forever as bytes memory
        // edge case, the fee tier last bits are makes divisible by 20 bytes.

        uint256 remainder = swapInfo.length % ADDRESS_LENGTH;
        if (remainder == 0) revert NoFeeData();
        bytes memory fees = swapInfo[swapInfo.length - remainder:]; // TODO check this

        uint256 numAddresses = (swapInfo.length - remainder) / ADDRESS_LENGTH;

        bytes memory pathes; 
        for (uint i = 0; i < numAddresses; i++)
        {   
            uint256 shiftRight =  6;
            uint256 shiftLeft = (2 * i) % 4;
            bytes1 feeByte = fees[i / 4];
            uint24 tier = _getTier(uint8((feeByte << shiftLeft) >> shiftRight));
            pathes = abi.encodePacked(pathes, swapInfo[i * ADDRESS_LENGTH:(i + 1) * ADDRESS_LENGTH], tier);
        }
        return pathes;
    }

    function _getTier(uint8 singleByte) internal pure returns (uint24) {
        if (singleByte > 3) {
            revert NoFeeTier();
        } else if (singleByte == 0) {
            return TIER_0;
        } else if (singleByte == 1) {
            return TIER_1;
        } else if (singleByte == 2) {
            return TIER_2;
        } else if (singleByte == 3) {
            return TIER_3;
        } else {
            revert NoFeeTier(); // should not be reachable
        }
    }

    function _checkDeadline(uint16 deadline) internal pure {
        if (END_OF_TIME >= block.timestamp) revert OutOfTime();
        if (DEADLINE_OFFSET + (deadline * DEADLINE_GRANULARITY) > block.timestamp) revert TransactionDeadlinePassed();
    }
}

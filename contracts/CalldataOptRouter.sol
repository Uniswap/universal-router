// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {V2SwapRouter} from './modules/uniswap/v2/V2SwapRouter.sol';
import {V3SwapRouter} from './modules/uniswap/v3/V3SwapRouter.sol';
import {V3Path} from './modules/uniswap/v3/V3Path.sol';
import {Constants} from './libraries/Constants.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';

abstract contract CalldataOptRouter is V2SwapRouter, V3SwapRouter {
    using V3Path for bytes;

    error TooLargeOfNumber();
    error TooManyHops();
    error NoFeeData();
    error NoFeeTier();
    error IncorrectMsgValue();

    uint256 constant AMOUNT_IN_OFFSET = 2;
    uint256 constant MAX_ADDRESSES = 8;
    uint256 constant MAX_HOPS = 7;
    uint256 constant ADDRESS_LENGTH = 20;
    uint256 constant FEE_BIT_SIZE = 2;

    uint24 constant TIER_0 = 100;
    uint24 constant TIER_1 = 500;
    uint24 constant TIER_2 = 3000;
    uint24 constant TIER_3 = 10000;

    uint256 constant FEE_BIPS = 15;
    uint256 constant BIPS_DENOMINATOR = 10000;

    address constant FEE_RECIPIENT = address(0xfee15);

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
        bool hasFee;

        (amountIn, amountOutMinimum, hasFee, path) = _decodeCalldataTwoInputs(swapInfo[2:]);

        address recipient = hasFee ? address(this) : msg.sender;
        v3SwapExactInput(recipient, amountIn, amountOutMinimum, path, msg.sender);

        if (hasFee) _takeFee(path);
    }

    function v3SwapTokenForExactToken(bytes calldata swapInfo) external checkDeadline(swapInfo) {
        uint256 amountInMaximum;
        uint256 amountOut;
        bytes memory path;
        bool hasFee;

        (amountOut, amountInMaximum, hasFee, path) = _decodeCalldataTwoInputs(swapInfo[2:]);

        address recipient = hasFee ? address(this) : msg.sender;
        v3SwapExactOutput(recipient, amountOut, amountInMaximum, path, msg.sender);

        if (hasFee) _takeFee(path);
    }

    function v3SwapExactETHForToken(bytes calldata swapInfo) external payable checkDeadline(swapInfo) {
        uint256 amountOutMinimum;
        bytes memory path;
        bool hasFee;

        (amountOutMinimum, hasFee, path) = _decodeCalldataOneInput(swapInfo[2:]);

        wrapETH(address(this), msg.value);

        address recipient = hasFee ? address(this) : msg.sender;
        v3SwapExactInput(recipient, msg.value, amountOutMinimum, path, address(this));

        if (hasFee) _takeFee(path);
    }

    function v3SwapTokenForExactETH(bytes calldata swapInfo) external checkDeadline(swapInfo) {
        uint256 amountIn;
        uint256 amountOutMinimum;
        bytes memory path;
        bool hasFee;

        (amountIn, amountOutMinimum, hasFee, path) = _decodeCalldataTwoInputs(swapInfo[2:]);

        v3SwapExactOutput(address(this), amountIn, amountOutMinimum, path, msg.sender);

        if (hasFee) {
            uint256 totalAmount = WETH9.balanceOf(address(this));
            uint256 feeAmount = totalAmount * FEE_BIPS / BIPS_DENOMINATOR;
            pay(address(WETH9), FEE_RECIPIENT, feeAmount);
        }

        unwrapWETH9(msg.sender, amountOutMinimum);
    }

    function _decodeCalldataTwoInputs(bytes calldata swapInfo)
        internal
        pure
        returns (uint256 preciseAmount, uint256 scientificAmount, bool hasFee, bytes memory path)
    {
        uint256 preciseAmountLength;

<<<<<<< Updated upstream
        (preciseAmount, preciseAmountLength) = _calculateAmount(swapInfo);
        // use scientific notation for the limit amount
        (scientificAmount, hasFee, path) = _decodeCalldataOneInput(swapInfo[preciseAmountLength + 1:]);
    }

    function _decodeCalldataOneInput(bytes calldata swapInfo)
        internal
        pure
        returns (uint256 scientificAmount, bool hasFee, bytes memory path)
    {
        scientificAmount = _calcuateScientificAmount(swapInfo[0], swapInfo[1]);
        (hasFee, path) = _parsePaths(swapInfo[2:]);
=======
        (amountIn, amountInLength) = _calculateAmount(swapInfo);
        (amountOut, amountOutLength) = _calculateAmount(swapInfo[amountInLength + 1:]);
        path = _parsePaths(swapInfo[amountInLength + 1 + amountOutLength + 1:]);
>>>>>>> Stashed changes
    }

    function _calculateAmount(bytes calldata swapInfo) internal pure returns (uint256, uint256) {
        uint8 amountLength = uint8(bytes1(swapInfo[0]));
        if (amountLength >= 32) revert TooLargeOfNumber();
        uint256 amount = uint256(bytes32(swapInfo[1:amountLength + 1]) >> (256 - (8 * amountLength)));
        uint256 mask = (2 ** (amountLength * 8)) - 1;
        uint256 maskedAmount = mask & amount;
        return (maskedAmount, amountLength);
    }

<<<<<<< Updated upstream
    function _calcuateScientificAmount(bytes1 firstByte, bytes1 secondByte) internal pure returns (uint256) {
        // always 2 bytes
        // first 10 bits is the coefficient, max 1023
        // last 6 bits is the exponent, max 63
        uint256 first = uint256(uint8(firstByte));
        uint8 second = uint8(secondByte);
        uint256 exponent = uint256((second << 2) >> 2);
        uint256 coefficient = (first << 2) + uint256(second >> 6);
        return coefficient * (10 ** exponent);
    }

    function _takeFee(bytes memory path) internal {
        address token = path.decodeLastToken();
        uint256 totalAmount = ERC20(token).balanceOf(address(this));
        uint256 feeAmount = totalAmount * FEE_BIPS / BIPS_DENOMINATOR;
        pay(token, FEE_RECIPIENT, feeAmount);
        pay(token, msg.sender, Constants.CONTRACT_BALANCE);
    }

    function _parsePaths(bytes calldata swapInfo) internal pure returns (bool, bytes memory) {
=======
    function _parsePaths(bytes calldata swapInfo) internal pure returns (bytes memory) {
>>>>>>> Stashed changes
        // cap num addresses at 9, fee tiers at 8, so 2 bytes (2 bits * 8), so divide by 4
        // with this, you cannot have more than 20 addresses ever (might be uneccesary)
        if (swapInfo.length > MAX_ADDRESSES * ADDRESS_LENGTH + (MAX_HOPS / 4) || swapInfo.length >= ADDRESS_LENGTH * 20)
        {
            revert TooManyHops();
        }

        // receives 20 bytes repeating followed by sets of 2 bit representing fee tiers followed by padding (will either be 1 or 2 bytes)
        // returns of 20 bytes for each address, followed by 3 bytes for the fee tier, repeat forever as bytes memory
        // edge case, the fee tier last bits are makes divisible by 20 bytes.
        uint256 shiftRight = 6;
        uint256 remainder = swapInfo.length % ADDRESS_LENGTH;
        if (remainder == 0) revert NoFeeData();
        bytes memory fees = swapInfo[swapInfo.length - remainder:];
        bool hasFee = (bytes1(fees[0]) >> 7) != 0;
        uint256 numAddresses = (swapInfo.length - remainder) / ADDRESS_LENGTH;

<<<<<<< Updated upstream
        bytes memory paths;
        for (uint256 i = 0; i < numAddresses; i++) {
            if (i < numAddresses - 1) {
                uint256 shiftLeft = 2 * (i + 1 % 4);
                bytes1 feeByte = fees[(i + 1) / 4];
                uint24 tier = _getTier(uint8((feeByte << shiftLeft) >> shiftRight));
                paths = abi.encodePacked(paths, swapInfo[i * ADDRESS_LENGTH:(i + 1) * ADDRESS_LENGTH], tier);
            } else {
                // last one doesn't have a tier
                paths = abi.encodePacked(paths, swapInfo[i * ADDRESS_LENGTH:(i + 1) * ADDRESS_LENGTH]);
            }
        }
        return (hasFee, paths);
=======
        bytes memory paths; 
        uint256 shiftRight = 6;
        for (uint i = 0; i < numAddresses; i++)
        {   
            uint256 shiftLeft = (2 * i) % 4;
            bytes1 feeByte = fees[i / 4];
            uint24 tier = _getTier(uint8((feeByte << shiftLeft) >> shiftRight));
            paths = abi.encodePacked(paths, swapInfo[i * ADDRESS_LENGTH:(i + 1) * ADDRESS_LENGTH], tier);
        }
        return paths;
>>>>>>> Stashed changes
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

    function _checkDeadline(uint16 deadline) internal view {
        if (END_OF_TIME >= block.timestamp) revert OutOfTime();
        if (DEADLINE_OFFSET + (deadline * DEADLINE_GRANULARITY) > block.timestamp) revert TransactionDeadlinePassed();
    }
}

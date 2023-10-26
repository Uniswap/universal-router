// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {V2SwapRouter} from './modules/uniswap/v2/V2SwapRouter.sol';
import {V3SwapRouter} from './modules/uniswap/v3/V3SwapRouter.sol';
import {PaymentsImmutables} from './modules/PaymentsImmutables.sol';
import {OracleLibrary} from './modules/uniswap/v3/OracleLibrary.sol';

abstract contract CalldataOptRouter is V2SwapRouter, V3SwapRouter {

    address immutable localUSDC;

    constructor(address _USDC) {
        localUSDC = _USDC;
    }


    function swapETHForUSDCOptimized() public payable {
        uint24 _feeTier = 5;
        address _poolAddress = computePoolAddress(address(WETH9), localUSDC, _feeTier);
        uint32 _period = uint32(block.timestamp - 3 minutes);
        (int24 arithmeticMeanTick,) = OracleLibrary.consult(_poolAddress, _period);

        uint256 _quoteAmount = OracleLibrary.getQuoteAtTick(
            arithmeticMeanTick, 
            uint128(msg.value), 
            address(WETH9), 
            localUSDC
        );

        uint256 _minOutput = _quoteAmount * 19 / 20;

        bytes memory _path = abi.encodePacked(address(WETH9), _feeTier, localUSDC);

        v3SwapExactInput(
            msg.sender,
            msg.value,
            _minOutput,
            _path,
            msg.sender
        ); 
    }

    error TooLargeOfNumber();

    error TooManyHops();

    uint constant AMOUNT_IN_OFFSET = 2; 
    uint constant MAX_ADDRESSES = 9; 
    uint constant MAX_HOPS = 8;

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

    function _parseAddresses(bytes calldata swapInfo, uint offset) internal pure returns (bytes memory) 
    {
        bytes memory rawBytes  = swapInfo[offset+1:];// from offset to end

        // cap num addresses at 9, fee tiers at 8, so 2 bytes (2 bits * 8), so divide by 4

        if(rawBytes.length > MAX_ADDRESSES * 20 + (MAX_HOPS / 4)) revert TooManyHops();

        // receives 20 bytes repeating followed by sets of 2 bit representing fee tiers followed by padding (will either be 1 or 2 bytes)
        // returns of 20 bytes for each address, followed by 3 bytes for the fee tier, repeat forever as bytes memory
        // edge case, the fee tier last bits are makes divisible by 20 bytes. 

        // abi.encodepacked(arg); -> makes a byte string
    }
    function _checkDeadline(uint16 deadline) internal {
        if (END_OF_TIME >= block.timestamp) revert OutOfTime();
        if (DEADLINE_OFFSET + (deadline * DEADLINE_GRANULARITY) > block.timestamp) revert TransactionDeadlinePassed();
    }

    function _encodePath();
}

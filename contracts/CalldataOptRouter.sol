// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {V2SwapRouter} from './modules/uniswap/v2/V2SwapRouter.sol';
import {V3SwapRouter} from './modules/uniswap/v3/V3SwapRouter.sol';

abstract contract CalldataOptRouter is V2SwapRouter, V3SwapRouter { 

    error TooLargeOfNumber(); 
    error TooManyHops();

    uint constant AMOUNT_IN_OFFSET = 2; 
    uint constant MAX_ADDRESSES = 9; 
    uint constant MAX_HOPS = 8;

    function v2SwapExactTokenForToken();
    function v2SwapTokenForExactToken();
    function v2SwapExactETHForToken();
    function v2SwapTokenForExactETH();
    function v3SwapExactTokenForToken();
    function v3SwapTokenForExactToken();
    function v3SwapExactETHForToken();
    function v3SwapTokenForExactETH();

    function _calcuateAmount(bytes calldata swapInfo, uint offset) internal pure returns (uint256)
    {
        uint8 numBytes = uint8(bytes1(swapInfo[offset]));
        if (numBytes >= 32) revert TooLargeOfNumber();
        bytes memory rawBytes  = swapInfo[offset+1:offset+1+numBytes];
        return _bytesToUint(rawBytes); 
    }

    function _bytesToUint(bytes memory b) internal pure returns (uint256){
        uint256 number;
        for(uint i=0;i<b.length;i++){
            number = number + uint(uint8(b[i]))*(2**(8*(b.length-(i+1))));
        }
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
}
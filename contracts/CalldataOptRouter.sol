// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {V2SwapRouter} from './modules/uniswap/v2/V2SwapRouter.sol';
import {V3SwapRouter} from './modules/uniswap/v3/V3SwapRouter.sol';
import {PaymentsImmutables} from './modules/PaymentsImmutables.sol';
import {OracleLibrary} from './modules/uniswap/v3/OracleLibrary.sol';

abstract contract CalldataOptRouter is V2SwapRouter, V3SwapRouter {

    address immutable localUSDC;

    constructor(address _USDC) {
        localUSDC = 0x7F5c764cBc14f9669B88837ca1490cCa17c31607;
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
}
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import '../base/Payments.sol';
import '../libraries/Path.sol';

contract V3SwapRouter {
    using Path for bytes;

    struct SwapCallbackData {
        bytes path;
        address payer;
    }

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata _data
    ) external {
        require(amount0Delta > 0 || amount1Delta > 0); // swaps entirely within 0-liquidity regions are not supported
        SwapCallbackData memory data = abi.decode(_data, (SwapCallbackData));
        (address tokenIn, address tokenOut, ) = data.path.decodeFirstPool();
        // verifyCallback(factory, tokenIn, tokenOut, fee);

        (bool isExactInput, uint256 amountToPay) = amount0Delta > 0
            ? (tokenIn < tokenOut, uint256(amount0Delta))
            : (tokenOut < tokenIn, uint256(amount1Delta));
        if (isExactInput) {
            pay(tokenIn, data.payer, msg.sender, amountToPay);
        } else {
            // either initiate the next swap or pay
            // if (data.path.hasMultiplePools()) {
            //     data.path = data.path.skipToken();
            //     exactOutputInternal(amountToPay, msg.sender, 0, data);
            // } else {
            //     amountInCached = amountToPay;
            //     tokenIn = tokenOut; // swap in/out because exact output swaps are reversed
            //     pay(tokenIn, data.payer, msg.sender, amountToPay);
            // }
        }
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {IUniswapV3SwapCallback} from '@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol';

/// @notice Mock V3 pool with a fixed exchange rate for testing per-hop slippage
contract MockV3Pool {
    address public immutable token0;
    address public immutable token1;
    uint256 public immutable rate; // output per input, 1e18 scale (0.9e18 = 90%)

    constructor(address _tokenA, address _tokenB, uint256 _rate) {
        (token0, token1) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
        rate = _rate;
    }

    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160, /* sqrtPriceLimitX96 */
        bytes calldata data
    ) external returns (int256 amount0Delta, int256 amount1Delta) {
        if (amountSpecified > 0) {
            // Exact input
            uint256 input = uint256(amountSpecified);
            uint256 output = input * rate / 1e18;
            (amount0Delta, amount1Delta) =
                zeroForOne ? (int256(input), -int256(output)) : (-int256(output), int256(input));
        } else {
            // Exact output
            uint256 output = uint256(-amountSpecified);
            uint256 input = (output * 1e18 + rate - 1) / rate; // round up
            (amount0Delta, amount1Delta) =
                zeroForOne ? (int256(input), -int256(output)) : (-int256(output), int256(input));
        }

        // Transfer output tokens to recipient
        if (amount0Delta < 0) ERC20(token0).transfer(recipient, uint256(-amount0Delta));
        if (amount1Delta < 0) ERC20(token1).transfer(recipient, uint256(-amount1Delta));

        // Callback to receive payment
        IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback(amount0Delta, amount1Delta, data);
    }
}

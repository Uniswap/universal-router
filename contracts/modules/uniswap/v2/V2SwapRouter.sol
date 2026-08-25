// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {IUniswapV2Pair} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import {UniswapV2Library} from './UniswapV2Library.sol';
import {UniswapImmutables} from '../UniswapImmutables.sol';
import {Permit2Payments} from '../../Permit2Payments.sol';
import {Constants} from '../../../libraries/Constants.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';

/// @title Router for Uniswap v2 Trades
abstract contract V2SwapRouter is UniswapImmutables, Permit2Payments {
    error V2TooLittleReceived();
    error V2TooMuchRequested();
    error V2InvalidPath();
    error V2TooLittleReceivedPerHop(uint256 hopIndex, uint256 minAmountOut, uint256 quotedAmountOut);
    error V2InvalidHopBoundLength();

    /// @dev Width of the minAmountOut field within a packed hop bound. Both fields hold V2 token
    /// amounts, which a pair stores as uint112, so 128 bits each is always sufficient.
    uint256 private constant HOP_BOUND_SHIFT = 128;

    /// @notice Splits a packed hop bound into its reference input and its minimum output
    /// @param hopBound referenceAmountIn in the high 128 bits, minAmountOut in the low 128 bits
    function _unpackHopBound(uint256 hopBound) private pure returns (uint256 referenceAmountIn, uint256 minAmountOut) {
        referenceAmountIn = hopBound >> HOP_BOUND_SHIFT;
        minAmountOut = uint128(hopBound);
    }

    function _v2Swap(address[] calldata path, address recipient, address pair, uint256[] calldata hopBounds) private {
        unchecked {
            // cached to save on duplicate operations
            (address token0,) = UniswapV2Library.sortTokens(path[0], path[1]);
            uint256 finalPairIndex = path.length - 1;
            uint256 penultimatePairIndex = finalPairIndex - 1;
            bool hopBoundsEnabled = hopBounds.length != 0;
            for (uint256 i; i < finalPairIndex; i++) {
                (address input, address output) = (path[i], path[i + 1]);
                (uint256 reserve0, uint256 reserve1,) = IUniswapV2Pair(pair).getReserves();
                (uint256 reserveInput, uint256 reserveOutput) =
                    input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
                // The bound is quoted off reserves at a caller supplied reference input, never off the
                // pair's token balance. A balance includes tokens anyone can transfer in, and a larger
                // apparent trade always earns a worse average rate, so a balance-derived bound lets a
                // third party push a hop under its floor and then recover the tokens with skim().
                // Reserves only move when the pool itself moves, which is the condition a slippage
                // bound is meant to detect.
                if (hopBoundsEnabled && hopBounds[i] != 0) {
                    (uint256 referenceAmountIn, uint256 minAmountOut) = _unpackHopBound(hopBounds[i]);
                    uint256 quotedAmountOut =
                        UniswapV2Library.getAmountOut(referenceAmountIn, reserveInput, reserveOutput);
                    if (quotedAmountOut < minAmountOut) {
                        revert V2TooLittleReceivedPerHop(i, minAmountOut, quotedAmountOut);
                    }
                }

                uint256 amountInput = ERC20(input).balanceOf(pair) - reserveInput;
                uint256 amountOutput = UniswapV2Library.getAmountOut(amountInput, reserveInput, reserveOutput);
                (uint256 amount0Out, uint256 amount1Out) =
                    input == token0 ? (uint256(0), amountOutput) : (amountOutput, uint256(0));
                address nextPair;
                (nextPair, token0) = i < penultimatePairIndex
                    ? UniswapV2Library.pairAndToken0For(
                        UNISWAP_V2_FACTORY, UNISWAP_V2_PAIR_INIT_CODE_HASH, output, path[i + 2]
                    )
                    : (recipient, address(0));

                IUniswapV2Pair(pair).swap(amount0Out, amount1Out, nextPair, new bytes(0));
                pair = nextPair;
            }
        }
    }

    /// @notice Performs a Uniswap v2 exact input swap
    /// @param recipient The recipient of the output tokens
    /// @param amountIn The amount of input tokens for the trade
    /// @param amountOutMinimum The minimum desired amount of output tokens
    /// @param path The path of the trade as an array of token addresses
    /// @param payer The address that will be paying the input
    /// @param hopBounds Per-hop bound array, one entry per hop, empty to disable. Each entry packs a
    /// reference input amount in the high 128 bits and a minimum output amount in the low 128 bits.
    /// A hop is checked by quoting its pair at the reference input against current reserves, so the
    /// reference need only approximate the amount actually routed. A zero entry skips that hop.
    function v2SwapExactInput(
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address[] calldata path,
        address payer,
        uint256[] calldata hopBounds
    ) internal {
        if (path.length < 2) revert V2InvalidPath();
        if (hopBounds.length != 0 && hopBounds.length != path.length - 1) {
            revert V2InvalidHopBoundLength();
        }

        address firstPair =
            UniswapV2Library.pairFor(UNISWAP_V2_FACTORY, UNISWAP_V2_PAIR_INIT_CODE_HASH, path[0], path[1]);
        if (
            amountIn != Constants.ALREADY_PAID // amountIn of 0 to signal that the pair already has the tokens
        ) {
            payOrPermit2Transfer(path[0], payer, firstPair, amountIn);
        }

        ERC20 tokenOut = ERC20(path[path.length - 1]);
        uint256 balanceBefore = tokenOut.balanceOf(recipient);

        _v2Swap(path, recipient, firstPair, hopBounds);

        uint256 amountOut = tokenOut.balanceOf(recipient) - balanceBefore;
        if (amountOut < amountOutMinimum) revert V2TooLittleReceived();
    }

    /// @notice Performs a Uniswap v2 exact output swap
    /// @param recipient The recipient of the output tokens
    /// @param amountOut The amount of output tokens to receive for the trade
    /// @param amountInMaximum The maximum desired amount of input tokens
    /// @param path The path of the trade as an array of token addresses
    /// @param payer The address that will be paying the input
    /// @param hopBounds Per-hop bound array, one entry per hop, empty to disable. Each entry packs a
    /// reference input amount in the high 128 bits and a minimum output amount in the low 128 bits.
    /// A hop is checked by quoting its pair at the reference input against current reserves, so the
    /// reference need only approximate the amount actually routed. A zero entry skips that hop.
    function v2SwapExactOutput(
        address recipient,
        uint256 amountOut,
        uint256 amountInMaximum,
        address[] calldata path,
        address payer,
        uint256[] calldata hopBounds
    ) internal {
        if (path.length < 2) revert V2InvalidPath();
        if (hopBounds.length != 0 && hopBounds.length != path.length - 1) {
            revert V2InvalidHopBoundLength();
        }

        (uint256 amountIn, address firstPair) =
            UniswapV2Library.getAmountInMultihop(UNISWAP_V2_FACTORY, UNISWAP_V2_PAIR_INIT_CODE_HASH, amountOut, path);
        if (amountIn > amountInMaximum) revert V2TooMuchRequested();

        payOrPermit2Transfer(path[0], payer, firstPair, amountIn);
        _v2Swap(path, recipient, firstPair, hopBounds);
    }
}

// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {V3Path} from './V3Path.sol';
import {BytesLib} from './BytesLib.sol';
import {SafeCast} from '@uniswap/v3-core/contracts/libraries/SafeCast.sol';
import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import {IUniswapV3SwapCallback} from '@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol';
import {Constants} from '../../../libraries/Constants.sol';
import {RouterImmutables} from '../../../base/RouterImmutables.sol';
import {Permit2Payments} from '../../Permit2Payments.sol';
import {Constants} from '../../../libraries/Constants.sol';
import {ERC20} from 'solmate/src/tokens/ERC20.sol';
import {TernaryLib} from '../TernaryLib.sol';

/// @title Router for Uniswap v3 Trades
abstract contract V3SwapRouter is RouterImmutables, Permit2Payments, IUniswapV3SwapCallback {
    using V3Path for bytes;
    using BytesLib for bytes;
    using SafeCast for uint256;
    using TernaryLib for bool;

    error V3InvalidSwap();
    error V3TooLittleReceived();
    error V3TooMuchRequested();
    error V3InvalidAmountOut();
    error V3InvalidCaller();

    /// @dev Used as the placeholder value for maxAmountIn, because the computed amount in for an exact output swap
    /// can never actually be this value
    uint256 private constant DEFAULT_MAX_AMOUNT_IN = type(uint256).max;

    /// @dev Transient storage variable used for checking slippage
    uint256 private maxAmountInCached = DEFAULT_MAX_AMOUNT_IN;

    /// @dev The minimum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MIN_TICK)
    uint160 internal constant MIN_SQRT_RATIO = 4295128739;

    /// @dev The maximum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MAX_TICK)
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        if (amount0Delta <= 0 && amount1Delta <= 0) revert V3InvalidSwap(); // swaps entirely within 0-liquidity regions are not supported
        (, address payer) = abi.decode(data, (bytes, address));
        bytes calldata path = data.toBytes(0);

        // because exact output swaps are executed in reverse order, in this case tokenOut is actually tokenIn
        (address tokenIn, uint24 fee, address tokenOut) = path.decodeFirstPool();

        if (computePoolAddress(tokenIn, tokenOut, fee) != msg.sender) revert V3InvalidCaller();

        (bool isExactInput, uint256 amountToPay) =
            amount0Delta > 0 ? (tokenIn < tokenOut, uint256(amount0Delta)) : (tokenOut < tokenIn, uint256(amount1Delta));

        if (isExactInput) {
            // Pay the pool (msg.sender)
            payOrPermit2Transfer(tokenIn, payer, msg.sender, amountToPay);
        } else {
            // either initiate the next swap or pay
            if (path.hasMultiplePools()) {
                // this is an intermediate step so the payer is actually this contract
                path = path.skipToken();
                _swap(-amountToPay.toInt256(), msg.sender, path, payer, false);
            } else {
                if (amountToPay > maxAmountInCached) revert V3TooMuchRequested();
                // note that because exact output swaps are executed in reverse order, tokenOut is actually tokenIn
                payOrPermit2Transfer(tokenOut, payer, msg.sender, amountToPay);
            }
        }
    }

    /// @notice Performs a Uniswap v3 exact input swap
    /// @param recipient The recipient of the output tokens
    /// @param amountIn The amount of input tokens for the trade
    /// @param amountOutMinimum The minimum desired amount of output tokens
    /// @param path The path of the trade as a bytes string
    /// @param payer The address that will be paying the input
    function v3SwapExactInput(
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum,
        bytes calldata path,
        address payer
    ) internal {
        // use amountIn == Constants.CONTRACT_BALANCE as a flag to swap the entire balance of the contract
        if (amountIn == Constants.CONTRACT_BALANCE) {
            address tokenIn = path.decodeFirstToken();
            amountIn = ERC20(tokenIn).balanceOf(address(this));
        }

        uint256 amountOut;
        while (true) {
            bool hasMultiplePools = path.hasMultiplePools();

            // the outputs of prior swaps become the inputs to subsequent ones
            (int256 amount0Delta, int256 amount1Delta, bool zeroForOne) = _swap(
                amountIn.toInt256(),
                hasMultiplePools.ternary(address(this), recipient), // for intermediate swaps, this contract custodies
                path.getFirstPool(), // only the first pool is needed
                payer, // for intermediate swaps, this contract custodies
                true
            );

            unchecked {
                // no need to check for overflow here as it will be caught in `toInt256()`
                amountIn = uint256(-zeroForOne.ternary(amount1Delta, amount0Delta));
            }

            // decide whether to continue or terminate
            if (hasMultiplePools) {
                payer = address(this);
                path = path.skipToken();
            } else {
                amountOut = amountIn;
                break;
            }
        }

        if (amountOut < amountOutMinimum) revert V3TooLittleReceived();
    }

    /// @notice Performs a Uniswap v3 exact output swap
    /// @param recipient The recipient of the output tokens
    /// @param amountOut The amount of output tokens to receive for the trade
    /// @param amountInMaximum The maximum desired amount of input tokens
    /// @param path The path of the trade as a bytes string
    /// @param payer The address that will be paying the input
    function v3SwapExactOutput(
        address recipient,
        uint256 amountOut,
        uint256 amountInMaximum,
        bytes calldata path,
        address payer
    ) internal {
        maxAmountInCached = amountInMaximum;
        (int256 amount0Delta, int256 amount1Delta, bool zeroForOne) =
            _swap(-amountOut.toInt256(), recipient, path, payer, false);

        unchecked {
            // no need to check for overflow
            uint256 amountOutReceived = uint256(-zeroForOne.ternary(amount1Delta, amount0Delta));
            if (amountOutReceived != amountOut) revert V3InvalidAmountOut();
        }

        maxAmountInCached = DEFAULT_MAX_AMOUNT_IN;
    }

    /// @dev Performs a single swap for both exactIn and exactOut
    /// For exactIn, `amount` is `amountIn`. For exactOut, `amount` is `-amountOut`
    function _swap(int256 amount, address recipient, bytes calldata path, address payer, bool isExactIn)
        private
        returns (int256 amount0Delta, int256 amount1Delta, bool zeroForOne)
    {
        address pool;
        {
            (address tokenIn, uint24 fee, address tokenOut) = path.decodeFirstPool();
            pool = computePoolAddress(tokenIn, tokenOut, fee);
            // When isExactIn == 1, zeroForOne = tokenIn < tokenOut = !(tokenOut < tokenIn) = 1 ^ (tokenOut < tokenIn)
            // When isExactIn == 0, zeroForOne = tokenOut < tokenIn = 0 ^ (tokenOut < tokenIn)
            assembly {
                zeroForOne := xor(isExactIn, lt(tokenOut, tokenIn))
            }
        }

        (amount0Delta, amount1Delta) = IUniswapV3Pool(pool).swap(
            recipient,
            zeroForOne,
            amount,
            uint160(zeroForOne.ternary(MIN_SQRT_RATIO + 1, MAX_SQRT_RATIO - 1)),
            abi.encode(path, payer)
        );
    }

    function computePoolAddress(address tokenA, address tokenB, uint24 fee) private view returns (address pool) {
        address factory = UNISWAP_V3_FACTORY;
        bytes32 initCodeHash = UNISWAP_V3_POOL_INIT_CODE_HASH;
        // accomplishes the following:
        // address(keccak256(abi.encodePacked(hex'ff', factory, keccak256(abi.encode(tokenA, tokenB, fee)), initCodeHash)))
        assembly ("memory-safe") {
            // Cache the free memory pointer.
            let fmp := mload(0x40)
            // Hash the pool key.
            // Equivalent to `if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA)`
            let diff := mul(xor(tokenA, tokenB), lt(tokenB, tokenA))
            // poolHash = keccak256(abi.encode(tokenA, tokenB, fee))
            mstore(0, xor(tokenA, diff))
            mstore(0x20, xor(tokenB, diff))
            mstore(0x40, fee)
            let poolHash := keccak256(0, 0x60)
            // abi.encodePacked(hex'ff', factory, poolHash, initCodeHash)
            // Prefix the factory address with 0xff.
            mstore(0, or(factory, 0xff0000000000000000000000000000000000000000))
            mstore(0x20, poolHash)
            mstore(0x40, initCodeHash)
            // Compute the CREATE2 pool address and clean the upper bits.
            pool := and(keccak256(0x0b, 0x55), 0xffffffffffffffffffffffffffffffffffffffff)
            // Restore the free memory pointer.
            mstore(0x40, fmp)
        }
    }
}

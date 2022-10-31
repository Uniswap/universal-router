// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import '../../Payments.sol';
import './V3Path.sol';
import '../UniswapPoolHelper.sol';
import '../../../libraries/Constants.sol';
import '@uniswap/v3-core/contracts/libraries/SafeCast.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '../../Permit2Payments.sol';

abstract contract V3SwapRouter is Permit2Payments {
    using V3Path for bytes;
    using SafeCast for uint256;

    error InvalidSwap();
    error V3TooLittleReceived();
    error V3TooMuchRequested();
    error V3InvalidAmountOut();

    /// @notice The identifying key of the pool
    struct PoolKey {
        address token0;
        address token1;
        uint24 fee;
    }

    address internal immutable V3_FACTORY;
    bytes32 internal immutable POOL_INIT_CODE_HASH_V3;

    /// @dev Used as the placeholder value for maxAmountIn, because the computed amount in for an exact output swap
    /// can never actually be this value
    uint256 private constant DEFAULT_MAX_AMOUNT_IN = type(uint256).max;

    /// @dev Transient storage variable used for checking slippage
    uint256 private maxAmountInCached = DEFAULT_MAX_AMOUNT_IN;
    /// @dev The minimum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MIN_TICK)
    uint160 internal constant MIN_SQRT_RATIO = 4295128739;

    /// @dev The maximum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MAX_TICK)
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    constructor(address v3Factory, bytes32 poolInitCodeHash) {
        V3_FACTORY = v3Factory;
        POOL_INIT_CODE_HASH_V3 = poolInitCodeHash;
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        if (amount0Delta <= 0 && amount1Delta <= 0) revert InvalidSwap(); // swaps entirely within 0-liquidity regions are not supported
        (bytes memory path, address payer) = abi.decode(data, (bytes, address));

        // because exact output swaps are executed in reverse order, in this case tokenOut is actually tokenIn
        (address tokenIn, address tokenOut,) = path.decodeFirstPool();

        (bool isExactInput, uint256 amountToPay) =
            amount0Delta > 0 ? (tokenIn < tokenOut, uint256(amount0Delta)) : (tokenOut < tokenIn, uint256(amount1Delta));

        if (isExactInput) {
            // Pay the pool (msg.sender)
            payOrPermit2Transfer(tokenIn, payer, msg.sender, amountToPay);
        } else {
            // either initiate the next swap or pay
            if (path.hasMultiplePools()) {
                // this is an intermediate step so the payer is actually this contract
                _swap(-amountToPay.toInt256(), msg.sender, path.skipToken(), payer, false);
            } else {
                require(amountToPay <= maxAmountInCached);
                // note that because exact output swaps are executed in reverse order, tokenOut is actually tokenIn
                payOrPermit2Transfer(tokenOut, payer, msg.sender, amountToPay);
            }
        }
    }

    function v3SwapExactInput(
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum,
        bytes memory path,
        address payer
    ) internal {
        // use amountIn == Constants.CONTRACT_BALANCE as a flag to swap the entire balance of the contract
        if (amountIn == Constants.CONTRACT_BALANCE) {
            address tokenIn = path.decodeFirstToken();
            amountIn = IERC20(tokenIn).balanceOf(address(this));
        }

        uint256 amountOut;
        while (true) {
            bool hasMultiplePools = path.hasMultiplePools();

            // the outputs of prior swaps become the inputs to subsequent ones
            (int256 amount0Delta, int256 amount1Delta, bool zeroForOne) = _swap(
                amountIn.toInt256(),
                hasMultiplePools ? address(this) : recipient, // for intermediate swaps, this contract custodies
                path.getFirstPool(), // only the first pool is needed
                payer, // for intermediate swaps, this contract custodies
                true
            );

            amountIn = uint256(-(zeroForOne ? amount1Delta : amount0Delta));

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

    function v3SwapExactOutput(
        address recipient,
        uint256 amountOut,
        uint256 amountInMaximum,
        bytes memory path,
        address payer
    ) internal {
        maxAmountInCached = amountInMaximum;
        (int256 amount0Delta, int256 amount1Delta, bool zeroForOne) =
            _swap(-amountOut.toInt256(), recipient, path, payer, false);

        (uint256 amountIn, uint256 amountOutReceived) = zeroForOne
            ? (uint256(amount0Delta), uint256(-amount1Delta))
            : (uint256(amount1Delta), uint256(-amount0Delta));

        if (amountOutReceived != amountOut) revert V3InvalidAmountOut();

        if (amountIn > amountInMaximum) revert V3TooMuchRequested();
        maxAmountInCached = DEFAULT_MAX_AMOUNT_IN;
    }

    /// @dev Performs a single swap for both exactIn and exactOut
    /// For exactIn, `amount` is `amountIn`. For exactOut, `amount` is `-amountOut`
    function _swap(int256 amount, address recipient, bytes memory path, address payer, bool isExactIn)
        private
        returns (int256 amount0Delta, int256 amount1Delta, bool zeroForOne)
    {
        (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();

        zeroForOne = isExactIn ? tokenIn < tokenOut : tokenOut < tokenIn;

        (amount0Delta, amount1Delta) = IUniswapV3Pool(
            UniswapPoolHelper.computePoolAddress(
                V3_FACTORY, abi.encode(getPoolKey(tokenIn, tokenOut, fee)), POOL_INIT_CODE_HASH_V3
            )
        ).swap(
            recipient,
            zeroForOne,
            amount,
            (zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1),
            abi.encode(path, payer)
        );
    }

    /// @notice Returns PoolKey: the ordered tokens with the matched fee levels
    /// @param tokenA The first token of a pool, unsorted
    /// @param tokenB The second token of a pool, unsorted
    /// @param fee The fee level of the pool
    /// @return Poolkey The pool details with ordered token0 and token1 assignments
    function getPoolKey(address tokenA, address tokenB, uint24 fee) internal pure returns (PoolKey memory) {
        if (tokenA > tokenB) {
            (tokenA, tokenB) = (tokenB, tokenA);
        }
        return PoolKey({token0: tokenA, token1: tokenB, fee: fee});
    }
}

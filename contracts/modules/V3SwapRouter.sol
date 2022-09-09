// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import '../base/Payments.sol';
import '../libraries/Path.sol';
import '../libraries/UniswapPoolHelper.sol';
import '@uniswap/v3-core/contracts/libraries/SafeCast.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';

abstract contract V3SwapRouter {
    using Path for bytes;
    using SafeCast for uint256;

    /// @notice The identifying key of the pool
    struct PoolKey {
        address token0;
        address token1;
        uint24 fee;
    }

    address immutable V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
    uint256 internal constant CONTRACT_BALANCE = 0;
    bytes32 internal constant POOL_INIT_CODE_HASH_V3 =
        0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;

    /// @dev Used as the placeholder value for amountInCached, because the computed amount in for an exact output swap
    /// can never actually be this value
    uint256 private constant DEFAULT_AMOUNT_IN_CACHED = type(uint256).max;

    /// @dev Transient storage variable used for returning the computed amount in for an exact output swap.
    uint256 private amountInCached = DEFAULT_AMOUNT_IN_CACHED;

    /// @dev The minimum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MIN_TICK)
    uint160 internal constant MIN_SQRT_RATIO = 4295128739;

    /// @dev The maximum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MAX_TICK)
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata path
    ) external {
        require(amount0Delta > 0 || amount1Delta > 0); // swaps entirely within 0-liquidity regions are not supported

        // note that because exact output swaps are executed in reverse order, tokenOut is actually tokenIn in this case
        (address tokenIn, address tokenOut, ) = path.decodeFirstPool();

        (bool isExactInput, uint256 amountToPay) = amount0Delta > 0
            ? (tokenIn < tokenOut, uint256(amount0Delta))
            : (tokenOut < tokenIn, uint256(amount1Delta));

        if (isExactInput) {
            // Pay the pool (msg.sender)
            Payments.pay(tokenIn, address(this), msg.sender, amountToPay);
        } else {
            // either initiate the next swap or pay
            if (path.hasMultiplePools()) {
                swapPrivate(-amountToPay.toInt256(), msg.sender, path.skipToken());
            } else {
                amountInCached = amountToPay;
                // note that because exact output swaps are executed in reverse order, tokenOut is actually tokenIn
                Payments.pay(tokenOut, address(this), msg.sender, amountToPay);
            }
        }
    }

    function v3SwapExactInput(
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum,
        bytes memory path
    ) internal returns (uint256 amountOut) {
        // use amountIn == Constants.CONTRACT_BALANCE as a flag to swap the entire balance of the contract
        if (amountIn == CONTRACT_BALANCE) {
            address tokenIn = path.decodeFirstToken();
            amountIn = IERC20(tokenIn).balanceOf(address(this));
        }

        while (true) {
            bool hasMultiplePools = path.hasMultiplePools();

            // the outputs of prior swaps become the inputs to subsequent ones
            (int256 amount0Delta, int256 amount1Delta, bool zeroForOne) = swapPrivate(
                amountIn.toInt256(),
                hasMultiplePools ? address(this) : recipient, // for intermediate swaps, this contract custodies
                path.getFirstPool() // only the first pool is needed
            );

            amountIn = uint256(-(zeroForOne ? amount1Delta : amount0Delta));

            // decide whether to continue or terminate
            if (hasMultiplePools) {
                path = path.skipToken();
            } else {
                amountOut = amountIn;
                break;
            }
        }

        require(amountOut >= amountOutMinimum, 'Too little received');
    }

    /// @dev Performs a single exact input swap
    /// For both exactIn and exactOut
    /// For exactIn, `amount` is `amountIn`. For exactOut, `amount` is `-amountOut`
    function swapPrivate(
        int256 amount,
        address recipient,
        bytes memory pool
    )
        private
        returns (
            int256 amount0Delta,
            int256 amount1Delta,
            bool zeroForOne
        )
    {
        (address tokenIn, address tokenOut, uint24 fee) = pool.decodeFirstPool();

        zeroForOne = tokenIn < tokenOut;

        (amount0Delta, amount1Delta) = IUniswapV3Pool(
            UniswapPoolHelper.computePoolAddress(
                V3_FACTORY,
                abi.encode(getPoolKey(tokenIn, tokenOut, fee)),
                POOL_INIT_CODE_HASH_V3
            )
        ).swap(recipient, zeroForOne, amount, (zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1), pool);
    }

    function v3SwapExactOutput(
        address recipient,
        uint256 amountOut,
        uint256 amountInMaximum,
        bytes memory path
    ) internal returns (uint256 amountIn) {
        (int256 amount0Delta, int256 amount1Delta, bool zeroForOne) = swapPrivate(
            -amountOut.toInt256(),
            recipient,
            path.getFirstPool()
        );

        uint256 amountOutReceived;
        (amountIn, amountOutReceived) = zeroForOne
            ? (uint256(amount0Delta), uint256(-amount1Delta))
            : (uint256(amount1Delta), uint256(-amount0Delta));

        // it's technically possible to not receive the full output amount,
        // so if no price limit has been specified, require this possibility away
        require(amountOutReceived == amountOut);

        amountIn = amountInCached;
        require(amountIn <= amountInMaximum, 'Too much requested');
        amountInCached = DEFAULT_AMOUNT_IN_CACHED;
    }

    /// @notice Returns PoolKey: the ordered tokens with the matched fee levels
    /// @param tokenA The first token of a pool, unsorted
    /// @param tokenB The second token of a pool, unsorted
    /// @param fee The fee level of the pool
    /// @return Poolkey The pool details with ordered token0 and token1 assignments
    function getPoolKey(
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal pure returns (PoolKey memory) {
        if (tokenA > tokenB) {
            (tokenA, tokenB) = (tokenB, tokenA);
        }
        return PoolKey({token0: tokenA, token1: tokenB, fee: fee});
    }
}

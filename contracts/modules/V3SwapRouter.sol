// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import './Payments.sol';
import '../libraries/Path.sol';
import '../libraries/UniswapPoolHelper.sol';
import '../libraries/Constants.sol';
import '@uniswap/v3-core/contracts/libraries/SafeCast.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import {Permit, Signature, IPermitPost} from 'permitpost/src/interfaces/IPermitPost.sol';

abstract contract V3SwapRouter {
    using Path for bytes;
    using SafeCast for uint256;

    /// @notice The identifying key of the pool
    struct PoolKey {
        address token0;
        address token1;
        uint24 fee;
    }

    // This is the data string that is passed from the narwhal router into this contract
    // The first is a regular uniswap path encoding
    // permitPostData is an encoding of a PermitPostData struct
    struct DataReceived {
        bytes path;
        bytes permitPostData;
    }

    // A struct containing information needed for permit post transfers
    struct PermitPostData {
        Permit permit;
        Signature signature;
    }

    // The struct of calldata passed into the callback from V3.
    // The boolean allows us to know what type of data is held in the bytes field
    struct SwapCallbackData {
        bool isPaymentCallbackData;
        // when isPaymentCallbackData is false, dataOrPath holds the trade path
        // when isPaymentCallbackData is true, dataOrPath is an encoding of a PaymentCallbackData struct
        bytes dataOrPath;
    }

    struct PaymentCallbackData {
        bytes path;
        bytes permitPostData;
        address user;
    }

    address internal immutable V3_FACTORY;
    bytes32 internal immutable POOL_INIT_CODE_HASH_V3;
    address immutable PERMIT_POST_CONTRACT;

    /// @dev Used as the placeholder value for amountInCached, because the computed amount in for an exact output swap
    /// can never actually be this value
    uint256 private constant DEFAULT_AMOUNT_IN_CACHED = type(uint256).max;

    /// @dev Transient storage variable used for returning the computed amount in for an exact output swap.
    uint256 private amountInCached = DEFAULT_AMOUNT_IN_CACHED;

    /// @dev The minimum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MIN_TICK)
    uint160 internal constant MIN_SQRT_RATIO = 4295128739;

    /// @dev The maximum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MAX_TICK)
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    constructor(address permitPost, address v3Factory, bytes32 poolInitCodeHash) {
        PERMIT_POST_CONTRACT = permitPost;
        V3_FACTORY = v3Factory;
        POOL_INIT_CODE_HASH_V3 = poolInitCodeHash;
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata _data) external {
        require(amount0Delta > 0 || amount1Delta > 0); // swaps entirely within 0-liquidity regions are not supported

        SwapCallbackData memory data = abi.decode(_data, (SwapCallbackData));

        bytes memory path;
        if (data.isPaymentCallbackData) {
            // This if statement means that the data is a PaymentCallbackData. If we are in an exact input
            // trade this must be the first hop. For exact output we pass the data through all calls.
            PaymentCallbackData memory paymentData = abi.decode(data.dataOrPath, (PaymentCallbackData));
            path = paymentData.path;

            // Because exact output swaps are executed in reverse order, in this case tokenOut is actually tokenIn
            (address tokenIn, address tokenOut,) = path.decodeFirstPool();

            (bool isExactInput, uint256 amountToPay) = amount0Delta > 0
                ? (tokenIn < tokenOut, uint256(amount0Delta))
                : (tokenOut < tokenIn, uint256(amount1Delta));

            if (isExactInput) {
                executePermitPost(amountToPay, paymentData.user, paymentData.permitPostData);
            } else {
                // either initiate the next swap or pay
                if (path.hasMultiplePools()) {
                    paymentData.path = path.skipToken();
                    data.dataOrPath = abi.encode(paymentData);
                    _swap(-amountToPay.toInt256(), msg.sender, abi.encode(data), false);
                } else {
                    amountInCached = amountToPay;
                    // note that because exact output swaps are executed in reverse order, tokenOut is actually tokenIn
                    executePermitPost(amountToPay, paymentData.user, paymentData.permitPostData);
                }
            }
        } else {
            // we should only enter this branch for exactInput swaps, except the first hop
            path = data.dataOrPath;
            (address tokenIn, address tokenOut,) = path.decodeFirstPool();

            (bool isExactInput, uint256 amountToPay) = amount0Delta > 0
                ? (tokenIn < tokenOut, uint256(amount0Delta))
                : (tokenOut < tokenIn, uint256(amount1Delta));

            if (!isExactInput) revert();
            Payments.payERC20(tokenIn, msg.sender, amountToPay);
        }
    }

    function executePermitPost(uint256 amount, address user, bytes memory permitPostData) private {
        address[] memory to = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        to[0] = msg.sender; // the pool
        amounts[0] = amount;

        PermitPostData memory data = abi.decode(permitPostData, (PermitPostData));

        // note that because exact output swaps are executed in reverse order, tokenOut is actually tokenIn
        IPermitPost(PERMIT_POST_CONTRACT).transferFrom(user, data.permit, to, amounts, data.signature);
    }

    function v3SwapExactInput(address recipient, uint256 amountIn, uint256 amountOutMinimum, bytes memory _data)
        internal
        returns (uint256 amountOut)
    {
        DataReceived memory data = abi.decode(_data, (DataReceived));
        bytes memory path = data.path;
        bool isFirstHop = true;

        // use amountIn == Constants.CONTRACT_BALANCE as a flag to swap the entire balance of the contract
        if (amountIn == Constants.CONTRACT_BALANCE) {
            address tokenIn = path.decodeFirstToken();
            amountIn = IERC20(tokenIn).balanceOf(address(this));
        }

        SwapCallbackData memory swapCallbackData;

        while (true) {
            bool hasMultiplePools = path.hasMultiplePools();

            // The user's permit post payment is taken in the first hop and then the data can be simpler
            if (isFirstHop) {
                PaymentCallbackData memory paymentCallbackData = PaymentCallbackData({
                    path: path.getFirstPool(),
                    permitPostData: data.permitPostData,
                    user: msg.sender
                });

                swapCallbackData =
                    SwapCallbackData({isPaymentCallbackData: true, dataOrPath: abi.encode(paymentCallbackData)});
            } else {
                swapCallbackData.dataOrPath = path.getFirstPool();
            }

            // the outputs of prior swaps become the inputs to subsequent ones
            (int256 amount0Delta, int256 amount1Delta, bool zeroForOne) = _swap(
                amountIn.toInt256(),
                hasMultiplePools ? address(this) : recipient, // for intermediate swaps, this contract custodies
                abi.encode(swapCallbackData),
                true
            );

            amountIn = uint256(-(zeroForOne ? amount1Delta : amount0Delta));

            if (isFirstHop) {
                delete swapCallbackData; // this will set isPaymentCallbackData to false for the remainder
                isFirstHop = false;
            }

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

    function v3SwapExactOutput(address recipient, uint256 amountOut, uint256 amountInMaximum, bytes memory _data)
        internal
        returns (uint256 amountIn)
    {
        DataReceived memory data = abi.decode(_data, (DataReceived));

        PaymentCallbackData memory paymentCallbackData =
            PaymentCallbackData({path: data.path, permitPostData: data.permitPostData, user: msg.sender});

        SwapCallbackData memory swapCallbackData =
            SwapCallbackData({isPaymentCallbackData: true, dataOrPath: abi.encode(paymentCallbackData)});

        (int256 amount0Delta, int256 amount1Delta, bool zeroForOne) =
            _swap(-amountOut.toInt256(), recipient, abi.encode(swapCallbackData), false);

        uint256 amountOutReceived;
        (amountIn, amountOutReceived) = zeroForOne
            ? (uint256(amount0Delta), uint256(-amount1Delta))
            : (uint256(amount1Delta), uint256(-amount0Delta));

        require(amountOutReceived == amountOut);

        amountIn = amountInCached;
        require(amountIn <= amountInMaximum, 'Too much requested');
        amountInCached = DEFAULT_AMOUNT_IN_CACHED;
    }

    /// @dev Performs a single swap for both exactIn and exactOut
    /// For exactIn, `amount` is `amountIn`. For exactOut, `amount` is `-amountOut`
    function _swap(int256 amount, address recipient, bytes memory pool, bool isExactIn)
        private
        returns (int256 amount0Delta, int256 amount1Delta, bool zeroForOne)
    {
        (address tokenIn, address tokenOut, uint24 fee) = pool.decodeFirstPool();

        zeroForOne = isExactIn ? tokenIn < tokenOut : tokenOut < tokenIn;

        (amount0Delta, amount1Delta) = IUniswapV3Pool(
            UniswapPoolHelper.computePoolAddress(
                V3_FACTORY, abi.encode(getPoolKey(tokenIn, tokenOut, fee)), POOL_INIT_CODE_HASH_V3
            )
        ).swap(recipient, zeroForOne, amount, (zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1), pool);
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

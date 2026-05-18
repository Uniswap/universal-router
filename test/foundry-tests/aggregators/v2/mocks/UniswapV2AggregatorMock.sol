// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHooks} from '@uniswap/v4-core/src/interfaces/IHooks.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {PoolId, PoolIdLibrary} from '@uniswap/v4-core/src/types/PoolId.sol';
import {Currency, CurrencyLibrary} from '@uniswap/v4-core/src/types/Currency.sol';
import {BeforeSwapDelta, toBeforeSwapDelta} from '@uniswap/v4-core/src/types/BeforeSwapDelta.sol';
import {SwapParams, ModifyLiquidityParams} from '@uniswap/v4-core/src/types/PoolOperation.sol';
import {IUniswapV2Pair} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import {IUniswapV2Factory} from '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';

/// @title  UniswapV2AggregatorMock
/// @notice Test-only mock that mirrors the V2-routing behavior of `UniswapV2Aggregator`
///         from v4-hooks-public. Inlined as a single file (no submodule, no precompile)
///         so test suites can override hook behavior, add observability, and exercise
///         edge cases beyond what the production hook exposes.
///
/// @dev    Behavioral parity with v4-hooks-public/UniswapV2Aggregator @ commit b53aa1d:
///         - permission flags: beforeInitialize + beforeAddLiquidity + beforeSwap + beforeSwapReturnsDelta
///         - `_conductSwap` pattern: sync → take → pair.swap → settle, returns BeforeSwapDelta
///         - exact-in supports fee-on-transfer input (uses post-take pair balance for getAmountOut)
///         - exact-out reverts on FoT input (documented limitation in real hook)
///         - rejects native ETH currency in both `_beforeInitialize` and `_beforeSwap`
///         - reverts on `beforeAddLiquidity` (pure aggregator)
///         Protocol-fee handling and `IFeeClassifiedHook` are intentionally omitted.
contract UniswapV2AggregatorMock {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    IPoolManager public immutable poolManager;
    address public immutable factory;

    /// @dev String, not immutable — for parity with `BaseAggregatorHook.aggregatorHookVersion`.
    string public aggregatorHookVersion;

    /// @notice PoolId → V2 pair address resolved during `beforeInitialize`.
    mapping(PoolId => address) public poolIdToExternalPair;
    /// @dev V2 pair → canonical PoolKey, enforces one-PoolKey-per-pair.
    mapping(address => PoolKey) private _canonicalPoolKeyByAddress;

    uint256 internal constant FEE = 3;
    uint256 internal constant FEE_DENOMINATOR = 1000;

    error NativeCurrencyNotSupported();
    error ExternalPoolNotFound();
    error ExternalPoolTokenMismatch();
    error InsufficientLiquidity();
    error PairAlreadyHasCanonicalPool(PoolId existingPoolId);
    error PoolDoesNotExist();
    error LiquidityNotAllowed();
    error NotPoolManager();
    error AmountInZero();
    error AmountOutZero();
    error UnexpectedSwapOutputDelta();

    event AggregatorPoolRegistered(PoolId indexed poolId);

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    constructor(IPoolManager _poolManager, address _factory, string memory _hookVersion) {
        poolManager = _poolManager;
        factory = _factory;
        aggregatorHookVersion = _hookVersion;
    }

    // --------------------------------------------------------------------- //
    // Hook entry points (called by PoolManager based on address-encoded flags)
    // --------------------------------------------------------------------- //

    function beforeInitialize(address, PoolKey calldata key, uint160) external onlyPoolManager returns (bytes4) {
        if (key.currency0.isAddressZero() || key.currency1.isAddressZero()) revert NativeCurrencyNotSupported();

        address token0 = Currency.unwrap(key.currency0);
        address token1 = Currency.unwrap(key.currency1);

        address pairAddr = IUniswapV2Factory(factory).getPair(token0, token1);
        if (pairAddr == address(0)) revert ExternalPoolNotFound();

        if (IUniswapV2Pair(pairAddr).token0() != token0 || IUniswapV2Pair(pairAddr).token1() != token1) {
            revert ExternalPoolTokenMismatch();
        }

        PoolKey storage existing = _canonicalPoolKeyByAddress[pairAddr];
        if (address(existing.hooks) != address(0)) revert PairAlreadyHasCanonicalPool(existing.toId());
        _canonicalPoolKeyByAddress[pairAddr] = key;

        PoolId id = key.toId();
        poolIdToExternalPair[id] = pairAddr;

        emit AggregatorPoolRegistered(id);
        return IHooks.beforeInitialize.selector;
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        revert LiquidityNotAllowed();
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        bool zeroForOne = params.zeroForOne;
        Currency takeCurrency = zeroForOne ? key.currency0 : key.currency1;
        Currency settleCurrency = zeroForOne ? key.currency1 : key.currency0;

        if (settleCurrency.isAddressZero() || takeCurrency.isAddressZero()) revert NativeCurrencyNotSupported();

        PoolId id = key.toId();
        address pairAddr = poolIdToExternalPair[id];
        if (pairAddr == address(0)) revert PoolDoesNotExist();

        poolManager.sync(settleCurrency);
        (uint256 amountTake, uint256 amountSettle) = _swapOnPair(pairAddr, takeCurrency, settleCurrency, params);
        poolManager.settle();

        if (params.amountSpecified > 0 && uint256(params.amountSpecified) != amountSettle) {
            revert UnexpectedSwapOutputDelta();
        }

        bool isExactInput = params.amountSpecified < 0;
        int128 unspecifiedDelta =
            isExactInput ? -int128(uint128(amountSettle)) : int128(uint128(amountTake));
        // Cancel core swap math; specified absorbs the swapper's intent
        int128 specifiedDelta = isExactInput ? int128(uint128(amountTake)) : -int128(uint128(amountSettle));

        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(specifiedDelta, unspecifiedDelta), 0);
    }

    // --------------------------------------------------------------------- //
    // V2 swap execution
    // --------------------------------------------------------------------- //

    /// @dev Pulls input from PoolManager to the pair via `take`, runs `pair.swap`, sends output back to PoolManager.
    ///      For exact-in, uses the actually-arrived balance on the pair (fee-on-transfer aware).
    function _swapOnPair(
        address pairAddr,
        Currency takeCurrency,
        Currency settleCurrency,
        SwapParams calldata params
    ) private returns (uint256 amountTakeUsed, uint256 amountSettle) {
        bool zeroForOne = params.zeroForOne;
        (uint112 r0, uint112 r1,) = IUniswapV2Pair(pairAddr).getReserves();
        (uint256 reserveIn, uint256 reserveOut) =
            zeroForOne ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        if (reserveIn == 0 || reserveOut == 0) revert ExternalPoolTokenMismatch();

        uint256 amountOut;
        if (params.amountSpecified < 0) {
            amountTakeUsed = uint256(-params.amountSpecified);
            uint256 balanceTakeBefore = takeCurrency.balanceOf(pairAddr);
            poolManager.take(takeCurrency, pairAddr, amountTakeUsed);
            uint256 balanceTakeAfter = takeCurrency.balanceOf(pairAddr);
            uint256 amountArrived = balanceTakeAfter - balanceTakeBefore;
            amountOut = _getAmountOut(amountArrived, reserveIn, reserveOut);
        } else {
            amountOut = uint256(params.amountSpecified);
            amountTakeUsed = _getAmountIn(amountOut, reserveIn, reserveOut);
            poolManager.take(takeCurrency, pairAddr, amountTakeUsed);
        }

        (uint256 amount0Out, uint256 amount1Out) = zeroForOne ? (uint256(0), amountOut) : (amountOut, uint256(0));

        uint256 balanceSettleBefore = settleCurrency.balanceOf(address(poolManager));
        IUniswapV2Pair(pairAddr).swap(amount0Out, amount1Out, address(poolManager), '');
        uint256 balanceSettleAfter = settleCurrency.balanceOf(address(poolManager));

        amountSettle = balanceSettleAfter - balanceSettleBefore;
    }

    // --------------------------------------------------------------------- //
    // V2 math (constant product with 0.3% fee)
    // --------------------------------------------------------------------- //

    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert AmountInZero();
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * FEE_DENOMINATOR + amountInWithFee;
        amountOut = numerator / denominator;
    }

    function _getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256 amountIn)
    {
        if (amountOut == 0) revert AmountOutZero();
        if (reserveIn == 0 || reserveOut == 0 || amountOut > reserveOut) revert InsufficientLiquidity();
        uint256 numerator = reserveIn * amountOut * FEE_DENOMINATOR;
        uint256 denominator = (reserveOut - amountOut) * (FEE_DENOMINATOR - FEE);
        amountIn = numerator / denominator + 1;
    }

    // --------------------------------------------------------------------- //
    // Views (parity with IUniswapV2Aggregator)
    // --------------------------------------------------------------------- //

    function pseudoTotalValueLocked(PoolId poolId) external view returns (uint256 amount0, uint256 amount1) {
        address pairAddr = poolIdToExternalPair[poolId];
        if (pairAddr == address(0)) revert PoolDoesNotExist();
        PoolKey storage poolKey = _canonicalPoolKeyByAddress[pairAddr];
        amount0 = poolKey.currency0.balanceOf(pairAddr);
        amount1 = poolKey.currency1.balanceOf(pairAddr);
    }

    function quote(bool zeroForOne, int256 amountSpecified, PoolId poolId)
        external
        view
        returns (uint256 amountUnspecified)
    {
        address pairAddr = poolIdToExternalPair[poolId];
        if (pairAddr == address(0)) revert PoolDoesNotExist();

        (uint112 r0, uint112 r1,) = IUniswapV2Pair(pairAddr).getReserves();
        (uint256 reserveIn, uint256 reserveOut) =
            zeroForOne ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));

        if (amountSpecified < 0) {
            amountUnspecified = _getAmountOut(uint256(-amountSpecified), reserveIn, reserveOut);
        } else {
            amountUnspecified = _getAmountIn(uint256(amountSpecified), reserveIn, reserveOut);
        }
    }
}

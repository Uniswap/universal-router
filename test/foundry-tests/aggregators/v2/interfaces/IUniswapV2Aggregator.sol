// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PoolId} from '@uniswap/v4-periphery/lib/v4-core/src/types/PoolId.sol';

/// @notice Minimal interface for the `UniswapV2Aggregator` hook from v4-hooks-public.
/// @dev    Used by the aggregator test suite for sanity assertions only.
///         Production swap interactions go through `PoolManager.swap()` against
///         a `PoolKey` whose `hooks` field is the hook's deployed address.
interface IUniswapV2Aggregator {
    /// @notice The canonical Uniswap V2 factory the hook resolves pairs against.
    function factory() external view returns (address);

    /// @notice Returns the version string set at hook construction.
    function aggregatorHookVersion() external view returns (string memory);

    /// @notice Returns the V2 pair address associated with a V4 pool id (set during `_beforeInitialize`).
    function poolIdToExternalPair(PoolId poolId) external view returns (address);

    /// @notice Returns the V2 reserves of the pair backing the V4 pool, in `currency0`/`currency1` order.
    function pseudoTotalValueLocked(PoolId poolId) external view returns (uint256 amount0, uint256 amount1);

    /// @notice Quotes a swap without executing it.
    /// @param  zeroForOne     Direction of the swap.
    /// @param  amountSpecified Negative for exact-in, positive for exact-out.
    /// @param  poolId         The V4 pool id (aggregator-backed).
    /// @return amountUnspecified  Output for exact-in, required input for exact-out.
    function quote(bool zeroForOne, int256 amountSpecified, PoolId poolId)
        external
        returns (uint256 amountUnspecified);
}

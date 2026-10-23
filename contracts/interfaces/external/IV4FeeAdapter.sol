// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';

/// @title IV4FeeAdapter
/// @notice The permissionless entrypoint of the protocol fee adapter that governance registers as the PoolManager's
/// protocolFeeController. Calling it pushes the adapter's resolved fee for a pool into PoolManager state.
interface IV4FeeAdapter {
    /// @notice Sets the protocol fee for an initialized pool to the value the adapter resolves for it
    /// @dev A no-op for uninitialized pools
    /// @param key The pool to update
    function triggerFeeUpdate(PoolKey calldata key) external;
}

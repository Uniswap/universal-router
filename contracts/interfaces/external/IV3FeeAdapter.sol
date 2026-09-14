// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

/// @title IV3FeeAdapter
/// @notice The permissionless entrypoint of the v3 protocol fee adapter that owns the v3 factory.
interface IV3FeeAdapter {
    /// @notice Sets the protocol fee for an initialized v3 pool to the value the adapter resolves for it
    /// @dev A no-op for uninitialized/nonexistent pools
    function triggerFeeUpdate(address pool) external;
}

// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

/// @notice A library to record, in transient storage, that the caller has opted into executing a
/// route inside a PoolManager unlock opened by another contract.
/// TODO: This library can be deleted when we have the transient keyword support in solidity.
library NestedUnlock {
    // The slot holding the opt-in state, transiently. Must equal TransientSlots.NESTED_UNLOCK; inline assembly only
    // accepts a literal here.
    bytes32 constant NESTED_UNLOCK_SLOT = 0x0000000000000000000000000000000000000000000000000000000000000006;

    function set(bool permitted) internal {
        assembly ('memory-safe') {
            tstore(NESTED_UNLOCK_SLOT, permitted)
        }
    }

    function isPermitted() internal view returns (bool permitted) {
        assembly ('memory-safe') {
            permitted := tload(NESTED_UNLOCK_SLOT)
        }
    }
}

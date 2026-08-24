// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

/// @notice A library to record, in transient storage, that the caller has opted into executing a
/// route inside a PoolManager unlock opened by another contract.
/// TODO: This library can be deleted when we have the transient keyword support in solidity.
library NestedUnlock {
    // The slot holding the opt-in state, transiently. bytes32(uint256(keccak256("NestedUnlock")) - 1)
    bytes32 constant NESTED_UNLOCK_SLOT = 0x904918ff601603e47e61e77f6dc30e7705c7e82b0e1bf84efb9b137e90ac8643;

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

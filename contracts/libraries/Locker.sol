// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

/// @notice A library to implement a reentrancy lock in transient storage.
/// @dev Instead of storing a boolean, the locker's address is stored to allow the contract to know who locked the contract
/// TODO: This library can be deleted when we have the transient keyword support in solidity.
library Locker {
    // The slot holding the locker state, transiently. Must equal TransientSlots.LOCKER; inline assembly only accepts
    // a literal here.
    bytes32 constant LOCKER_SLOT = 0x0000000000000000000000000000000000000000000000000000000000000001;

    function set(address locker) internal {
        // The locker is always msg.sender or address(0) so does not need to be cleaned
        assembly ('memory-safe') {
            tstore(LOCKER_SLOT, locker)
        }
    }

    function get() internal view returns (address locker) {
        assembly ('memory-safe') {
            locker := tload(LOCKER_SLOT)
        }
    }

    function isLocked() internal view returns (bool) {
        return Locker.get() != address(0);
    }
}

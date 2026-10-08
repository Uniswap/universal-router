// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.24;

import {NESTED_UNLOCK_SLOT} from './TransientSlots.sol';

/// @notice A library to record, in transient storage, that the caller has opted into executing a
/// route inside a PoolManager unlock opened by another contract.
library NestedUnlock {
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

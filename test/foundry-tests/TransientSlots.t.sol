// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {
    LOCKER_SLOT,
    MAX_AMOUNT_IN_SLOT,
    ROUTE_SIGNER_SLOT,
    ROUTE_INTENT_SLOT,
    ROUTE_DATA_SLOT,
    NESTED_UNLOCK_SLOT,
    RESOLVED_AMOUNT_SLOT
} from '../../contracts/libraries/TransientSlots.sol';

/// @notice Every transient slot the router touches comes from the TransientSlots table and must be distinct,
/// since transient storage is shared by all libraries compiled into the router.
contract TransientSlotsTest is Test {
    function _allSlots() internal pure returns (bytes32[] memory slots) {
        slots = new bytes32[](7);
        slots[0] = LOCKER_SLOT;
        slots[1] = MAX_AMOUNT_IN_SLOT;
        slots[2] = ROUTE_SIGNER_SLOT;
        slots[3] = ROUTE_INTENT_SLOT;
        slots[4] = ROUTE_DATA_SLOT;
        slots[5] = NESTED_UNLOCK_SLOT;
        slots[6] = RESOLVED_AMOUNT_SLOT;
    }

    function test_slotsAreDistinct() public pure {
        bytes32[] memory slots = _allSlots();
        for (uint256 i = 0; i < slots.length; i++) {
            for (uint256 j = i + 1; j < slots.length; j++) {
                assertNotEq(slots[i], slots[j]);
            }
        }
    }

    /// @dev Writing one slot must not disturb any other, which is what distinctness buys at runtime.
    function test_fuzz_slotsDoNotAlias(uint256 value) public {
        bytes32[] memory slots = _allSlots();
        for (uint256 i = 0; i < slots.length; i++) {
            bytes32 slot = slots[i];
            assembly ('memory-safe') {
                tstore(slot, value)
            }
            for (uint256 j = 0; j < slots.length; j++) {
                bytes32 other = slots[j];
                uint256 read;
                assembly ('memory-safe') {
                    read := tload(other)
                }
                assertEq(read, j == i ? value : 0);
            }
            assembly ('memory-safe') {
                tstore(slot, 0)
            }
        }
    }
}

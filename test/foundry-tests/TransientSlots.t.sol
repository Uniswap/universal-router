// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {TransientSlots} from '../../contracts/libraries/TransientSlots.sol';
import {Locker} from '../../contracts/libraries/Locker.sol';
import {MaxInputAmount} from '../../contracts/libraries/MaxInputAmount.sol';
import {NestedUnlock} from '../../contracts/libraries/NestedUnlock.sol';
import {ResolvedAmount} from '../../contracts/libraries/ResolvedAmount.sol';
import {RouteSigner} from '../../contracts/base/RouteSigner.sol';
import {EIP712} from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';

contract RouteSignerSlots is RouteSigner {
    constructor() EIP712('UniversalRouter', '2') {}

    function slots() external pure returns (bytes32, bytes32, bytes32) {
        return (ROUTE_SIGNER_SLOT, ROUTE_INTENT_SLOT, ROUTE_DATA_SLOT);
    }
}

/// @notice Every transient slot the router touches must come from the TransientSlots table and be distinct,
/// since transient storage is shared by all libraries compiled into the router.
contract TransientSlotsTest is Test {
    function _allSlots() internal pure returns (bytes32[] memory slots) {
        slots = new bytes32[](7);
        slots[0] = TransientSlots.LOCKER;
        slots[1] = TransientSlots.MAX_AMOUNT_IN;
        slots[2] = TransientSlots.ROUTE_SIGNER;
        slots[3] = TransientSlots.ROUTE_INTENT;
        slots[4] = TransientSlots.ROUTE_DATA;
        slots[5] = TransientSlots.NESTED_UNLOCK;
        slots[6] = TransientSlots.RESOLVED_AMOUNT;
    }

    function test_slotsAreDistinct() public pure {
        bytes32[] memory slots = _allSlots();
        for (uint256 i = 0; i < slots.length; i++) {
            for (uint256 j = i + 1; j < slots.length; j++) {
                assertNotEq(slots[i], slots[j]);
            }
        }
    }

    /// @dev Inline assembly only accepts literal slot constants, so each library repeats its number; this pins
    /// every copy to the table.
    function test_librariesUseTableSlots() public {
        assertEq(Locker.LOCKER_SLOT, TransientSlots.LOCKER);
        assertEq(MaxInputAmount.MAX_AMOUNT_IN_SLOT, TransientSlots.MAX_AMOUNT_IN);
        assertEq(NestedUnlock.NESTED_UNLOCK_SLOT, TransientSlots.NESTED_UNLOCK);
        assertEq(ResolvedAmount.RESOLVED_AMOUNT_SLOT, TransientSlots.RESOLVED_AMOUNT);
        (bytes32 signer, bytes32 intent, bytes32 data) = new RouteSignerSlots().slots();
        assertEq(signer, TransientSlots.ROUTE_SIGNER);
        assertEq(intent, TransientSlots.ROUTE_INTENT);
        assertEq(data, TransientSlots.ROUTE_DATA);
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

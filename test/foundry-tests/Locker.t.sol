// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {Locker} from '../../contracts/libraries/Locker.sol';

contract LockerTest is Test {
    function test_fuzz_set_get(address locker1, address locker2, address locker3) public {
        assertEq(Locker.get(), address(0));

        Locker.set(locker1);
        assertEq(Locker.get(), locker1);

        Locker.set(locker2);
        assertEq(Locker.get(), locker2);

        Locker.set(locker3);
        assertEq(Locker.get(), locker3);

        Locker.set(address(0));
        assertEq(Locker.get(), address(0));
    }

    function test_fuzz_isLocked(address locker) public {
        assertEq(Locker.get(), address(0));
        assertEq(Locker.isLocked(), false);

        Locker.set(locker);
        // the contract is locked when the locker is not address(0)
        assertEq(Locker.isLocked(), locker != address(0));

        Locker.set(address(0));
        assertEq(Locker.isLocked(), false);
    }

    function test_lockerSlot() public {
        bytes32 expectedSlot = bytes32(uint256(keccak256('Locker')) - 1);
        assertEq(expectedSlot, Locker.LOCKER_SLOT);
    }
}

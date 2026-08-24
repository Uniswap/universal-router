// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {ResolvedAmount} from '../../contracts/libraries/ResolvedAmount.sol';
import {TransientSlots} from '../../contracts/libraries/TransientSlots.sol';

contract ResolvedAmountTest is Test {
    function test_fuzz_resolvedAmount_set_get_reset(uint256 value1, uint256 value2) public {
        assertEq(ResolvedAmount.get(), 0);

        ResolvedAmount.set(value1);
        assertEq(ResolvedAmount.get(), value1);

        ResolvedAmount.set(value2);
        assertEq(ResolvedAmount.get(), value2);

        ResolvedAmount.reset();
        assertEq(ResolvedAmount.get(), 0);
    }

    function test_resolvedAmountSlot() public pure {
        assertEq(ResolvedAmount.RESOLVED_AMOUNT_SLOT, TransientSlots.RESOLVED_AMOUNT);
    }
}

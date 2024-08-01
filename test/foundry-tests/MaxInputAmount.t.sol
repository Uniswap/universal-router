// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {MaxInputAmount} from '../../contracts/libraries/MaxInputAmount.sol';

contract MaxInputAmountTest is Test {
    function test_fuzz_maxAmtIn_set_get(uint256 value1, uint256 value2, uint256 value3) public {
        assertEq(MaxInputAmount.get(), 0);

        MaxInputAmount.set(value1);
        assertEq(MaxInputAmount.get(), value1);

        MaxInputAmount.set(value2);
        assertEq(MaxInputAmount.get(), value2);

        MaxInputAmount.set(value3);
        assertEq(MaxInputAmount.get(), value3);

        MaxInputAmount.set(0);
        assertEq(MaxInputAmount.get(), 0);
    }

    function test_maxAmtInSlot() public {
        bytes32 expectedSlot = bytes32(uint256(keccak256('MaxAmountIn')) - 1);
        assertEq(expectedSlot, MaxInputAmount.MAX_AMOUNT_IN_SLOT);
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import 'forge-std/Test.sol';
import {BytesLib} from '../../contracts/modules/uniswap/v3/BytesLib.sol';

/// @dev The library reads calldata, so an external wrapper is needed to feed it.
contract BytesLibHarness {
    using BytesLib for bytes;

    function toLengthOffset(bytes calldata data, uint256 arg) external pure returns (uint256 length, uint256 offset) {
        return data.toLengthOffset(arg);
    }
}

contract BytesLibTest is Test {
    BytesLibHarness harness;

    function setUp() public {
        harness = new BytesLibHarness();
    }

    /// @dev toLengthOffset counts 32-byte elements, so a word array is the natural fixture.
    function _twoWordArray() internal pure returns (bytes memory) {
        uint256[] memory words = new uint256[](2);
        words[0] = 7;
        words[1] = 9;
        return abi.encode(words);
    }

    function test_toLengthOffset_readsTheFirstDynamicElement() public view {
        (uint256 length,) = harness.toLengthOffset(_twoWordArray(), 0);
        assertEq(length, 2);
    }

    /// @notice OZ 2.3.0 N-06: 32 * _arg wraps to zero for _arg = 2^251, so the old byte-offset guard let the read
    ///         through and silently returned element 0.
    function test_toLengthOffset_revertsWhenHeadOffsetWouldWrap() public {
        vm.expectRevert(BytesLib.SliceOutOfBounds.selector);
        harness.toLengthOffset(_twoWordArray(), 1 << 251);
    }

    function test_fuzz_toLengthOffset_revertsWhenHeadWordIsOutOfBounds(bytes calldata data, uint256 arg) public {
        vm.assume(arg >= data.length / 32);

        vm.expectRevert(BytesLib.SliceOutOfBounds.selector);
        harness.toLengthOffset(data, arg);
    }
}

// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.6.0;

import {BytesLib} from './BytesLib.sol';

/// @title Functions for manipulating path data for multihop swaps
library V3Path {
    using BytesLib for bytes;

    error SliceOutOfBounds();

    /// @dev The length of the bytes encoded address
    uint256 private constant ADDR_SIZE = 20;

    /// @dev The length of the bytes encoded fee
    uint256 private constant FEE_SIZE = 3;

    /// @dev The offset of a single token address (20) and pool fee (3)
    uint256 private constant NEXT_OFFSET = ADDR_SIZE + FEE_SIZE;

    /// @dev The offset of an encoded pool key
    /// Token (20) + Fee (3) + Token (20) = 43
    uint256 private constant POP_OFFSET = NEXT_OFFSET + ADDR_SIZE;

    /// @dev The minimum length of an encoding that contains 2 or more pools
    uint256 private constant MULTIPLE_POOLS_MIN_LENGTH = POP_OFFSET + NEXT_OFFSET;

    /// @notice Returns true iff the path contains two or more pools
    /// @param path The encoded swap path
    /// @return True if path contains two or more pools, otherwise false
    function hasMultiplePools(bytes calldata path) internal pure returns (bool) {
        return path.length >= MULTIPLE_POOLS_MIN_LENGTH;
    }

    /// @notice Decodes the first pool in path
    /// @param path The bytes encoded swap path
    /// @return tokenA The first token of the given pool
    /// @return fee The fee level of the pool
    /// @return tokenB The second token of the given pool
    function decodeFirstPool(bytes calldata path) internal pure returns (address, uint24, address) {
        if (path.length < POP_OFFSET) revert SliceOutOfBounds();
        return path.toPool();
    }

    /// @notice Gets the segment corresponding to the first pool in the path
    /// @param path The bytes encoded swap path
    /// @return The segment containing all data necessary to target the first pool in the path
    function getFirstPool(bytes calldata path) internal pure returns (bytes calldata) {
        return path[:POP_OFFSET];
    }

    function decodeFirstToken(bytes calldata path) internal pure returns (address tokenA) {
        if (path.length < ADDR_SIZE) revert SliceOutOfBounds();
        tokenA = path.toAddress();
    }

    /// @notice Skips a token + fee element
    /// @param path The swap path
    function skipToken(bytes calldata path) internal pure returns (bytes calldata) {
        return path[NEXT_OFFSET:];
    }
}

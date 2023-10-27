// SPDX-License-Identifier: GPL-3.0-or-later

/// @title Library for Bytes Manipulation
/// Based on Gonçalo Sá's BytesLib - but updated and heavily editted
pragma solidity ^0.8.0;

library BytesLib {
    error SliceOverflow();
    error SliceOutOfBounds();
    error ToAddressOverflow();
    error ToAddressOutOfBounds();
    error ToUint24Overflow();
    error ToUint24OutOfBounds();
    error NoSlice();

    // Constants used in slicePool
    // 43 bytes: token + feeTier + token
    uint256 internal constant POOL_LENGTH = 43;
    // Offset from beginning of _bytes to start copying from given that 43 isnt a multiple of 32
    uint256 internal constant OFFSET = 11; // 43-32=11

    // Constants used in inPlaceSliceToken
    uint256 internal constant ADDR_AND_FEE_LENGTH = 23;

    /// @notice Slices and returns the first 43 bytes from a bytes string
    /// @dev 43 bytes = pool (20 bytes) + feeTier (3 bytes) + pool (20 bytes)
    /// @param _bytes The input bytes string
    /// @return tempBytes The first 43 bytes of the input bytes string
    function slicePool(bytes memory _bytes) internal pure returns (bytes memory tempBytes) {
        if (_bytes.length < POOL_LENGTH) revert SliceOutOfBounds();

        assembly ("memory-safe") {
            // Get a location of some free memory and store it in tempBytes as
            // Solidity does for memory variables.
            tempBytes := mload(0x40)

            // The first word of the slice result is a partial word read from the
            //  original array - given that 43 is not a multiple of 32. To read it,
            // we use the length of that partial word (43-32=11) and start copying
            // that many bytes into the array. The first word we copy will start
            // with data we don't care about, but the last 11 bytes will
            // land at the beginning of the contents of the new array. When
            // we're done copying, we overwrite the full first word with
            // the actual length of the slice.
            let copyDestination := add(tempBytes, OFFSET)
            let endNewBytes := add(copyDestination, POOL_LENGTH)

            let copyFrom := add(_bytes, OFFSET)

            mstore(copyDestination, mload(copyFrom))

            copyDestination := add(copyDestination, 0x20)
            copyFrom := add(copyFrom, 0x20)
            mstore(copyDestination, mload(copyFrom))

            mstore(tempBytes, POOL_LENGTH)

            // update free-memory pointer
            // allocating the array padded to 32 bytes like the compiler does now
            mstore(0x40, add(tempBytes, 0x60))
        }
    }

    /// @notice Removes the first 23 bytes of a bytes string in-place
    /// @dev 23 bytes = pool (20 bytes) + feeTier (3 bytes)
    /// @param _bytes The input bytes string to slice
    function inPlaceSliceToken(bytes memory _bytes, uint256 _length) internal pure {
        unchecked {
            if (_length + 31 < _length) revert SliceOverflow();
            if (ADDR_AND_FEE_LENGTH + _length < ADDR_AND_FEE_LENGTH) revert SliceOverflow();
            if (_bytes.length < ADDR_AND_FEE_LENGTH + _length) revert SliceOutOfBounds();
            if (_length == 0) revert NoSlice();
        }

        assembly ("memory-safe") {
            // The first word of the slice result is potentially a partial
            // word read from the original array. To read it, we calculate
            // the length of that partial word and start copying that many
            // bytes into the array. The first word we copy will start with
            // data we don't care about, but the last `lengthmod` bytes will
            // land at the beginning of the contents of the new array. When
            // we're done copying, we overwrite the full first word with
            // the actual length of the slice.

            // 31==0b11111 to extract the final 5 bits of the length of the slice - the amount that
            // the length in bytes goes over a round number of bytes32
            let lengthmod := and(_length, 31)

            // The multiplication in the next line is necessary
            // because when slicing multiples of 32 bytes (lengthmod == 0)
            // the following copy loop was copying the origin's length
            // and then ending prematurely not copying everything it should.

            // if the _length is not a multiple of 32, offset is lengthmod
            // otherwise its 32 (as lengthmod is 0)
            // offset from beginning of _bytes to start copying from
            let offset := add(lengthmod, mul(0x20, iszero(lengthmod)))

            // this does calculates where to start copying bytes into
            // bytes is the location where the bytes array is
            // byte+offset is the location where copying should start from
            let copyDestination := add(_bytes, offset)
            let endNewBytes := add(copyDestination, _length)

            for { let copyFrom := add(copyDestination, ADDR_AND_FEE_LENGTH) } lt(copyDestination, endNewBytes) {
                copyDestination := add(copyDestination, 0x20)
                copyFrom := add(copyFrom, 0x20)
            } { mstore(copyDestination, mload(copyFrom)) }

            mstore(_bytes, _length)
        }
    }

    /// @notice Returns the address starting at byte `_start`
    /// @dev _bytesLength must equal _bytes.length for this to function correctly
    /// @param _bytes The input bytes string to slice
    /// @param _start The starting index of the address
    /// @param _bytesLength The length of _bytes
    /// @return tempAddress The address starting at _start
    function toAddress(bytes memory _bytes, uint256 _start, uint256 _bytesLength)
        internal
        pure
        returns (address tempAddress)
    {
        unchecked {
            if (_start + 20 < _start) revert ToAddressOverflow();
            if (_bytesLength < _start + 20) revert ToAddressOutOfBounds();
        }

        assembly {
            tempAddress := mload(add(add(_bytes, 0x14), _start))
        }
    }

    /// @notice Returns the uint24 starting at byte `_start`
    /// @dev _bytesLength must equal _bytes.length for this to function correctly
    /// @param _bytes The input bytes string to slice
    /// @param _start The starting index of the uint24
    /// @param _bytesLength The length of _bytes
    /// @return tempUint24 The uint24 starting at _start
    function toUint24(bytes memory _bytes, uint256 _start, uint256 _bytesLength)
        internal
        pure
        returns (uint24 tempUint24)
    {
        unchecked {
            if (_start + 3 < _start) revert ToUint24Overflow();
            if (_bytesLength < _start + 3) revert ToUint24OutOfBounds();
        }

        assembly {
            tempUint24 := mload(add(add(_bytes, 0x3), _start))
        }
    }
}

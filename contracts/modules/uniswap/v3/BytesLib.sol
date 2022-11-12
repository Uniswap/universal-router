// SPDX-License-Identifier: GPL-2.0-or-later
/*
 * @title Solidity Bytes Arrays Utils
 * @author Gonçalo Sá <goncalo.sa@consensys.net>
 *
 * @dev Bytes tightly packed arrays utility library for ethereum contracts written in Solidity.
 *      The library lets you concatenate, slice and type cast bytes arrays both in memory and storage.
 */
pragma solidity ^0.8.0;

library BytesLib {
    error SliceOverflow();
    error SliceOutOfBounds();
    error ToAddressOverflow();
    error ToAddressOutOfBounds();
    error ToUint24Overflow();
    error ToUint24OutOfBounds();
    error NoSlice();

    function slice(bytes memory _bytes, uint256 _start, uint256 _length) internal pure returns (bytes memory) {
        unchecked {
            if (_length + 31 < _length) revert SliceOverflow();
            if (_start + _length < _start) revert SliceOverflow();
            if (_bytes.length < _start + _length) revert SliceOutOfBounds();
            if (_length == 0) revert NoSlice();
        }

        assembly {
            // The first word of the slice result is potentially a partial
            // word read from the original array. To read it, we calculate
            // the length of that partial word and start copying that many
            // bytes into the array. The first word we copy will start with
            // data we don't care about, but the last `lengthmod` bytes will
            // land at the beginning of the contents of the new array. When
            // we're done copying, we overwrite the full first word with
            // the actual length of the slice.
            let lengthmod := and(_length, 31)

            // The multiplication in the next line is necessary
            // because when slicing multiples of 32 bytes (lengthmod == 0)
            // the following copy loop was copying the origin's length
            // and then ending prematurely not copying everything it should.
            let x := add(lengthmod, mul(0x20, iszero(lengthmod)))
            let mc := add(_bytes, x)
            let end := add(mc, _length)

            for { let cc := add(add(_bytes, x), _start) } lt(mc, end) {
                mc := add(mc, 0x20)
                cc := add(cc, 0x20)
            } { mstore(mc, mload(cc)) }

            mstore(_bytes, _length)
        }

        return _bytes;
    }

    // requires that bytesLength IS bytes.length to work securely
    function toAddress(bytes memory _bytes, uint256 _start, uint256 _bytesLength) internal pure returns (address) {
        unchecked {
            if (_start + 20 < _start) revert ToAddressOverflow();
            if (_bytesLength < _start + 20) revert ToAddressOutOfBounds();
        }
        address tempAddress;

        assembly {
            tempAddress := mload(add(add(_bytes, 0x14), _start))
        }

        return tempAddress;
    }

    // requires that bytesLength IS bytes.length to work securely
    function toUint24(bytes memory _bytes, uint256 _start, uint256 _bytesLength) internal pure returns (uint24) {
        unchecked {
            if (_start + 3 < _start) revert ToUint24Overflow();
            if (_bytesLength < _start + 3) revert ToUint24OutOfBounds();
        }
        uint24 tempUint;

        assembly {
            tempUint := mload(add(add(_bytes, 0x3), _start))
        }

        return tempUint;
    }
}

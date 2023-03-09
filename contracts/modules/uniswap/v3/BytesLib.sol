// SPDX-License-Identifier: GPL-3.0-or-later

/// @title Library for Bytes Manipulation
/// Based on Gonçalo Sá's BytesLib - but updated and heavily editted
pragma solidity ^0.8.0;

library BytesLib {
    /// @notice Returns the address starting at byte 0
    /// @dev length and overflow checks must be carried out before calling
    /// @param _bytes The input bytes string to slice
    /// @return tempAddress The address starting at byte 0
    function toAddress(bytes calldata _bytes) internal pure returns (address tempAddress) {
        assembly {
            tempAddress := shr(96, calldataload(_bytes.offset))
        }
    }

    /// @notice Returns the pool details starting at byte 0
    /// @dev length and overflow checks must be carried out before calling
    /// @param _bytes The input bytes string to slice
    /// @return token0 The address at byte 0
    /// @return fee The uint24 starting at byte 20
    /// @return token1 The address at byte 23
    function toPool(bytes calldata _bytes) internal pure returns (address token0, uint24 fee, address token1) {
        assembly {
            token0 := shr(96, calldataload(_bytes.offset))
            fee := shr(232, calldataload(add(_bytes.offset, 20)))
            token1 := shr(96, calldataload(add(_bytes.offset, 23)))
        }
    }

    /// @notice Decode the `_arg`-th element in `_bytes` as a dynamic array
    /// @dev The decoding of `length` and `offset` is universal,
    /// whereas the type declaration of `res` instructs the compiler how to read it.
    /// @param _bytes The input bytes string to slice
    /// @param _arg The index of the argument to extract
    /// @return length Length of the array
    /// @return offset Pointer to the data part of the array
    function toLengthOffset(bytes calldata _bytes, uint256 _arg)
        internal
        pure
        returns (uint256 length, uint256 offset)
    {
        assembly {
            // The offset of the `_arg`-th element is `32 * arg`, which stores the offset of the length pointer.
            let lengthPtr := add(_bytes.offset, calldataload(add(_bytes.offset, mul(0x20, _arg))))
            length := calldataload(lengthPtr)
            offset := add(lengthPtr, 0x20)
        }
    }

    /// @notice Decode the `_arg`-th element in `_bytes` as `bytes`
    /// @param _bytes The input bytes string to extract a bytes string from
    /// @param _arg The index of the argument to extract
    function toBytes(bytes calldata _bytes, uint256 _arg) internal pure returns (bytes calldata res) {
        (uint256 length, uint256 offset) = toLengthOffset(_bytes, _arg);
        assembly {
            res.length := length
            res.offset := offset
        }
    }

    /// @notice Decode the `_arg`-th element in `_bytes` as `address[]`
    /// @param _bytes The input bytes string to extract an address array from
    /// @param _arg The index of the argument to extract
    function toAddressArray(bytes calldata _bytes, uint256 _arg) internal pure returns (address[] calldata res) {
        (uint256 length, uint256 offset) = toLengthOffset(_bytes, _arg);
        assembly {
            res.length := length
            res.offset := offset
        }
    }

    /// @notice Decode the `_arg`-th element in `_bytes` as `bytes[]`
    /// @param _bytes The input bytes string to extract a bytes array from
    /// @param _arg The index of the argument to extract
    function toBytesArray(bytes calldata _bytes, uint256 _arg) internal pure returns (bytes[] calldata res) {
        (uint256 length, uint256 offset) = toLengthOffset(_bytes, _arg);
        assembly {
            res.length := length
            res.offset := offset
        }
    }
}
